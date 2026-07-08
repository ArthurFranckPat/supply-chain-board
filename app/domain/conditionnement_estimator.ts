/**
 * Estimateur de US/palette pour les articles dont le coef de palettisation
 * (ITMMASTER.PCUSTUCOE_1 = UC/palette) est manquant.
 *
 * Deux sources d'observation indépendantes, articulées par priorité :
 *
 * 1. **STOCK** (prioritaire, état présent) : les lignes de stock détaillé sur
 *    emplacement de palettisation (`SM*`). Mais le stock peut être ENTAMÉ : un
 *    emplacement à qté partielle (palette ouverte) fausse la médiane. On ne
 *    trusted le STOCK que s'il existe une **valeur dominante** — i.e. plusieurs
 *    emplacements portant la MÊME qté (le signal d'une palette pleine type).
 *    Sans valeur partagée par ≥ 2 emplacements, le STOCK est jugé non fiable et
 *    on laisse le fallback STOJOU prendre le relais.
 *
 * 2. **STOJOU** (fallback, historique 6 mois) : chaque changement d'emplacement
 *    depuis la zone de réception (`TRSTYP=7` AND `LOC='REC'`, qté négative = sortie
 *    de REC) est le rangement d'une palette issue d'une réception fournisseur
 *    libérée du contrôle qualité. La médiane des `|QTYSTU_0|` = US/palette. On
 *    cible l'origine `REC` (pas la destination) pour ne capter que les palettes
 *    de réception, et exclure les transferts internes SM*-vers-SM* / SM*-vers-PRE qui ne sont
 *    pas des palettes de réception.
 *
 * AUCUN accès X3 ici : ce module ne fait que transformer des observations déjà
 * chargées en estimation (testable isolément, cf. tests/domain/).
 */

/** Source de l'estimation retenue pour un article. */
export type EstimationSource = 'STOCK' | 'STOJOU'

/** Niveau de confiance de l'estimation, piloté par le nombre d'observations. */
export type Confiance = 'ok' | 'faible'

export interface EstimationResult {
  /** US par palette estimé (> 0). */
  usParPalette: number
  source: EstimationSource
  confiance: Confiance
  /** Nombre d'observations ayant servi à l'estimation. */
  observations: number
}

/**
 * Seuil minimum d'observations pour une confiance 'ok'. En dessous, l'estimation
 * est conservée mais marquée 'faible' (le planificateur sait qu'elle est fragile).
 */
export const SEUIL_CONFIANCE_OK = 3

/**
 * Nb minimum d'emplacements STOCK partageant la même qté pour valider la valeur
 * dominante. En dessous, le STOCK est jugé non fiable (stock entamé ou palette
 * unique) et on laisse le fallback STOJOU prendre le relais.
 *
 * 2 = au moins deux palettes identiques → le signal qu'il s'agit d'une palette
 * pleine type, pas d'un reliquat partiel.
 */
export const SEUIL_DOMINANCE_STOCK = 2

/**
 * Médiane d'un tableau de nombres. Trie une copie (ne mute pas l'entrée).
 * Retourne null si le tableau est vide. Pour un nombre pair d'éléments, prend la
 * moyenne des deux valeurs centrales (médiane standard).
 *
 * NB : la médiane n'est PLUS utilisée pour l'estimation (remplacée par `mode` -
 * voir ci-dessous). Conservée pour référence / tests.
 */
export function median(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null
  const triees = [...valeurs].sort((a, b) => a - b)
  const n = triees.length
  const milieu = Math.floor(n / 2)
  if (n % 2 === 1) return triees[milieu]!
  return (triees[milieu - 1]! + triees[milieu]!) / 2
}

/**
 * Mode d'un tableau de nombres = la valeur la plus récurrente (la plus
 * fréquente). Plus robuste que la médiane face aux palettes partielles : si un
 * article est rangé 10 fois à 960 et une fois à 17 (palette entamée), le mode
 * retourne 960 (le conditionnement dominant) tandis que la médiane pourrait
 * dériver. En cas d'égalité (ex. deux valeurs ex aequo), retourne la plus grande.
 *
 * Retourne null si le tableau est vide.
 */
export function mode(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null
  const compte = new Map<number, number>()
  for (const v of valeurs) compte.set(v, (compte.get(v) ?? 0) + 1)
  let meilleureValeur = Number.NaN
  let meilleureOcc = 0
  for (const [valeur, occurrences] of compte) {
    // Strictement plus fréquent, ou ex aequo mais valeur plus grande.
    if (occurrences > meilleureOcc || (occurrences === meilleureOcc && valeur > meilleureValeur)) {
      meilleureValeur = valeur
      meilleureOcc = occurrences
    }
  }
  return Number.isNaN(meilleureValeur) ? null : meilleureValeur
}

/**
 * Observation de palette pour un article : une quantité US (= le contenu d'une
 * palette), issue soit de STOCK (ligne d'emplacement SM*) soit de STOJOU (un
 * mouvement de rangement TRSTYP=7 sur SM*).
 *
 * `source` permet de mélanger les observations dans un même tableau si besoin,
 * tout en gardant la traçabilité.
 */
export interface PaletteObservation {
  /** US par palette observés (toujours > 0, valeur absolue du mouvement). */
  us: number
  source: EstimationSource
  /**
   * Type d'emplacement STOCK : `'stockage'` (SM*, palette type fiable) ou
   * `'conso'` (S*P/CLP, palette entamée → qté variable, exclus du consensus).
   * Non renseigné pour les observations STOJOU (sans objet).
   */
  typeEmplacement?: 'stockage' | 'conso'
}

/**
 * Filtre les observations valides : US strictement positif et fini.
 *
 * On exclut :
 *  - les qtés nulles/négatives (déjà passées en absolu côté repository, mais on
 *    blinde les erreurs de parsing),
 *  - les articles de paramétrage (STOCK_CF, STOCK_PRODUIT…) à qté 1 qui ne
 *    représentent pas une vraie palette (le filtre us > 1 les écarte aussi, mais
 *    c'est un filet de sécurité),
 *  - les valeurs non finies (NaN, Infinity issues d'un parse X3 défaillant).
 */
function observationsValides(obs: PaletteObservation[]): PaletteObservation[] {
  return obs.filter((o) => Number.isFinite(o.us) && o.us > 1)
}

/**
 * Valeur retenue pour l'estimation STOCK selon la règle des emplacements palette :
 *
 *  - **Cas A — consensus SM*** : ≥ 2 emplacements de stockage (`SM*`) à la MÊME
 *    valeur → on retourne cette valeur (palette type confirmée par redondance).
 *  - **Cas B — SM* + conso** : exactement 1 emplacement de stockage (`SM*`) +
 *    au moins 1 emplacement de consommation (`S*P`/`CLP`, valeur différente
 *    autorisée) → on retourne la valeur du `SM*` (le S*P valide la présence
 *    d'un stock palette, mais sa valeur est ignorée car entamée).
 *
 * La présence d'au moins un `SM*` est OBLIGATOIRE : un stock constitué
 * uniquement de `S*P`/`CLP` (consommation) n'est pas fiable (palette entamée).
 *
 * Retourne null si : aucun `SM*`, ou plusieurs `SM*` à valeurs toutes
 * différentes (stock entamé, pas de palette type identifiable) SANS S*P/CLP
 * pour valider la branche B.
 */
function valeurStock(stockage: PaletteObservation[], conso: PaletteObservation[]): number | null {
  // Cas A : consensus sur les SM* (≥ 2 à la même valeur).
  const compte = new Map<number, number>()
  for (const o of stockage) compte.set(o.us, (compte.get(o.us) ?? 0) + 1)
  for (const [valeur, occurrences] of compte) {
    if (occurrences >= SEUIL_DOMINANCE_STOCK) return valeur
  }
  // Cas B : 1 SM* + au moins 1 S*P/CLP → on prend la valeur du SM*.
  // (S'il y a plusieurs SM* à valeurs différentes, on prend la dominante.)
  if (stockage.length >= 1 && conso.length >= 1) {
    if (stockage.length === 1) return stockage[0]!.us
    // Plusieurs SM* différents + conso : on prend le mode des SM*.
    return mode(stockage.map((o) => o.us))
  }
  return null
}

/**
 * Estimation STOCK : applique la règle des emplacements palette (consensus SM*
 * ou SM* + conso). Un SM* est toujours requis ; les S*P/CLP valident la
 * présence mais leur valeur est ignorée (consommation).
 */
export function estimerDepuisStock(obs: PaletteObservation[]): EstimationResult | null {
  const valides = observationsValides(obs.filter((o) => o.source === 'STOCK'))
  const stockage = valides.filter((o) => o.typeEmplacement === 'stockage')
  const conso = valides.filter((o) => o.typeEmplacement === 'conso')
  const valeur = valeurStock(stockage, conso)
  if (valeur === null || valeur <= 0) return null
  return {
    usParPalette: valeur,
    source: 'STOCK',
    confiance: valides.length >= SEUIL_CONFIANCE_OK ? 'ok' : 'faible',
    observations: valides.length,
  }
}

/**
 * Estimation STOJOU : mode (valeur la plus récurrente) des qtés de rangement
 * historiques. Plus robuste que la médiane face aux palettes partielles : si un
 * article est rangé 10 fois à 960 et une fois à 17 (palette entamée), le mode
 * retourne 960 (conditionnement dominant) tandis que la médiane dérive.
 */
function estimerDepuisStojou(obs: PaletteObservation[]): EstimationResult | null {
  const valides = observationsValides(obs.filter((o) => o.source === 'STOJOU'))
  if (valides.length === 0) return null
  const valeurMode = mode(valides.map((o) => o.us))
  if (valeurMode === null || valeurMode <= 0) return null
  return {
    usParPalette: valeurMode,
    source: 'STOJOU',
    confiance: valides.length >= SEUIL_CONFIANCE_OK ? 'ok' : 'faible',
    observations: valides.length,
  }
}

/**
 * Estimation US/palette d'un article en combinant STOCK (prioritaire) et STOJOU
 * (fallback).
 *
 * Logique :
 *  1. Si STOCK a une valeur dominante fiable (≥ 2 emplacements à la même qté) →
 *     on retourne l'estimation STOCK (palette type observée sur le stock live).
 *  2. Sinon (stock entamé / palette unique / vide), fallback STOJOU : médiane des
 *     rangements historiques (palettes complètes au moment du rangement).
 *  3. Sinon null → l'article reste « Coef manquant » (aucune estimation possible).
 *
 * On ne mélange jamais les sources : garder la source distincte permet au
 * planificateur de jauger la fiabilité (STOCK = palette type live, STOJOU =
 * historique de rangements).
 */
export function estimerUsParPalette(
  stockObs: PaletteObservation[],
  stojouObs: PaletteObservation[]
): EstimationResult | null {
  // 1. STOCK d'abord (prioritaire) — uniquement si valeur dominante fiable.
  const fromStock = estimerDepuisStock(stockObs)
  if (fromStock) return fromStock

  // 2. Fallback STOJOU.
  const fromStojou = estimerDepuisStojou(stojouObs)
  if (fromStojou) return fromStojou

  // 3. Aucune observation exploitable.
  return null
}

/**
 * Enrichit un coef US/palette manquant avec une estimation.
 *
 * Retourne le coef estimé (> 0) si une estimation existe, sinon null (l'appelant
 * garde le comportement « coef manquant »).
 */
export function appliquerEstimation(estimation: EstimationResult | null): number | null {
  if (!estimation || estimation.usParPalette <= 0) return null
  return estimation.usParPalette
}

/**
 * Les deux estimations indépendantes (STOCK + STOJOU) d'un article, pour comparaison.
 * Chaque source est calculée séparément, sans priorité ni fallback — l'appelant
 * affiche les deux pour validation croisée.
 *
 * `null` sur une source = aucune estimation exploitable pour cette source.
 */
export interface EstimationsPaire {
  stock: EstimationResult | null
  stojou: EstimationResult | null
}

/**
 * Calcule les DEUX estimations (STOCK et STOJOU) indépendamment, pour comparaison.
 *
 * Contrairement à `estimerUsParPalette` (qui choisit la meilleure par priorité),
 * cette fonction retourne systématiquement les deux pour que l'utilisateur les
 * compare et valide : concordance = forte confiance, divergence = à vérifier.
 */
export function estimerLesDeux(
  stockObs: PaletteObservation[],
  stojouObs: PaletteObservation[]
): EstimationsPaire {
  return {
    stock: estimerDepuisStock(stockObs),
    stojou: estimerDepuisStojou(stojouObs),
  }
}

/**
 * Tolérance de concordance entre deux valeurs US/pal (en %). Deux valeurs sont
 * considérées "égales" si leur écart relatif est ≤ TOLERANCE_CONCORDANCE.
 * Ex : 960 et 1000 → écart 4,2% → concordants (tolérance 5%).
 */
export const TOLERANCE_CONCORDANCE = 0.05

/** Vrai si deux valeurs US/pal sont concordantes (écart relatif ≤ tolérance). */
export function concordent(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false
  const ref = Math.max(a, b)
  return Math.abs(a - b) / ref <= TOLERANCE_CONCORDANCE
}

/** Nombre de sources concordantes parmi celles disponibles. */
export type NiveauConcordance = 0 | 1 | 2 | 3

/**
 * Évalue la concordance entre les 3 sources US/pal :
 *  - `ucParPal`   : coef référencé ITMMASTER (PCUSTUCOE_1, déjà en US/pal).
 *  - `stock`      : estimation STOCK (consensus SM*).
 *  - `stojou`     : estimation STOJOU (mode des rangements).
 *
 * Compte combien de paires concordent (parmi celles disponibles) :
 *  - 3/3 : toutes les sources disponibles concordent → forte confiance.
 *  - 2/3 : deux sources concordent, une diverge → à vérifier.
 *  - 1/3 : une source isolée (les autres divergent ou absentes) → fragile.
 *  - 0/3 : aucune source, ou toutes divergent → rattrapage manuel.
 *
 * `nbSources` = nombre de sources disponibles (0 à 3).
 * `nbConcordantes` = nombre de paires concordantes.
 */
export function evaluerConcordance(
  ucParPal: number | null,
  stock: EstimationResult | null,
  stojou: EstimationResult | null
): { niveau: NiveauConcordance; nbSources: number; nbConcordantes: number } {
  // Valeurs disponibles (> 0).
  const vals: number[] = []
  if (ucParPal && ucParPal > 0) vals.push(ucParPal)
  if (stock && stock.usParPalette > 0) vals.push(stock.usParPalette)
  if (stojou && stojou.usParPalette > 0) vals.push(stojou.usParPalette)
  const nbSources = vals.length
  if (nbSources === 0) return { niveau: 0, nbSources: 0, nbConcordantes: 0 }
  if (nbSources === 1) return { niveau: 1, nbSources: 1, nbConcordantes: 0 }

  // Compte les paires concordantes.
  let nbConcordantes = 0
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (concordent(vals[i]!, vals[j]!)) nbConcordantes++
    }
  }
  // Niveau = nb de sources qui concordent avec au moins une autre.
  // Si toutes les paires concordent → niveau = nbSources.
  const nbPaires = (nbSources * (nbSources - 1)) / 2
  const niveau = (nbConcordantes === nbPaires ? nbSources : nbConcordantes) as NiveauConcordance
  return { niveau, nbSources, nbConcordantes }
}
