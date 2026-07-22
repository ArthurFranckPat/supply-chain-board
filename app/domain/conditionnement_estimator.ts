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
 * 2. **STOJOU** (fallback) : chaque changement d'emplacement depuis la zone de
 *    réception (`TRSTYP=7` AND `LOC='REC'`, qté négative = sortie de REC) est le
 *    rangement d'une palette issue d'une réception fournisseur libérée du
 *    contrôle qualité — donc une palette COMPLÈTE : le reliquat naît à la
 *    consommation, pas à la réception. `|QTYSTU_0|` = US/palette directement. On
 *    cible l'origine `REC` (pas la destination) pour ne capter que les palettes
 *    de réception, et exclure les transferts internes SM*-vers-SM* / SM*-vers-PRE qui ne sont
 *    pas des palettes de réception. On examine les `NB_MOUVEMENTS_STOJOU` derniers
 *    rangements, sans borne d'ancienneté.
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
 * Valeur retenue pour l'estimation STOCK — RÈGLE UNIQUE : **consensus SM***.
 *
 * Il faut ≥ `SEUIL_DOMINANCE_STOCK` (2) emplacements de stockage (`SM*`) portant
 * la MÊME quantité. Cette redondance est la seule preuve qu'on observe une
 * palette type et non un reliquat : deux emplacements distincts ne se retrouvent
 * pas à la même qté par hasard.
 *
 * Un `SM*` UNIQUE ne prouve RIEN, même accompagné d'un `S*P`/`CLP`. Contre-exemple
 * qui a motivé la suppression de l'ancienne branche « 1 SM* + conso » : article à
 * 100 en `SMAC11` + 457 en `S9P`. Rien ne dit que les 100 ne sont pas le reliquat
 * d'une palette ayant servi à réalimenter le `S9P` — l'ancienne règle affirmait
 * pourtant « palette = 100 ». On ne conclut plus : STOJOU prend le relais.
 *
 * Les `S*P`/`CLP` (consommation) sont donc totalement hors-jeu : ni valeur, ni
 * présence. Ils ne servent qu'à être exclus du consensus.
 *
 * En cas d'égalité (deux qtés atteignant le seuil avec le MÊME nombre
 * d'emplacements), aucune n'est plus légitime que l'autre → null. Sinon, la plus
 * fréquente gagne (et non la première rencontrée : l'ordre des lignes X3 n'est
 * pas un critère métier).
 *
 * Retourne `{ valeur, occurrences }`, ou null si pas de consensus.
 */
function valeurStock(stockage: PaletteObservation[]): { valeur: number; occurrences: number } | null {
  const compte = new Map<number, number>()
  for (const o of stockage) compte.set(o.us, (compte.get(o.us) ?? 0) + 1)

  let meilleure: { valeur: number; occurrences: number } | null = null
  let exAequo = false
  for (const [valeur, occurrences] of compte) {
    if (occurrences < SEUIL_DOMINANCE_STOCK) continue
    if (!meilleure || occurrences > meilleure.occurrences) {
      meilleure = { valeur, occurrences }
      exAequo = false
    } else if (occurrences === meilleure.occurrences) {
      exAequo = true
    }
  }
  // Deux conditionnements candidats à égalité stricte : indécidable, on se tait.
  return exAequo ? null : meilleure
}

/**
 * Estimation STOCK : consensus d'au moins `SEUIL_DOMINANCE_STOCK` emplacements
 * `SM*` à la même quantité. Les `S*P`/`CLP` sont ignorés (palette entamée).
 *
 * `observations` = nombre d'emplacements portant la valeur RETENUE (pas le total
 * des lignes lues) : la confiance doit refléter ce qui soutient le verdict.
 */
export function estimerDepuisStock(obs: PaletteObservation[]): EstimationResult | null {
  const valides = observationsValides(obs.filter((o) => o.source === 'STOCK'))
  const stockage = valides.filter((o) => o.typeEmplacement === 'stockage')
  const consensus = valeurStock(stockage)
  if (consensus === null || consensus.valeur <= 0) return null
  return {
    usParPalette: consensus.valeur,
    source: 'STOCK',
    confiance: consensus.occurrences >= SEUIL_CONFIANCE_OK ? 'ok' : 'faible',
    observations: consensus.occurrences,
  }
}

/**
 * Nombre de rangements récents examinés par article. Les palettes reçues d'un
 * fournisseur sont complètes (le reliquat naît à la consommation, pas à la
 * réception), donc le dernier rangement porte déjà le conditionnement. On en
 * prend 3 pour disposer d'une redondance : concordance = confirmation, divergence
 * = signal (conditionnement changé, ou mouvement groupant plusieurs palettes).
 */
export const NB_MOUVEMENTS_STOJOU = 3

/** Nb de rangements concordants suffisant pour une confiance 'ok'. */
export const SEUIL_DOMINANCE_STOJOU = 2

/**
 * Estimation STOJOU : les `NB_MOUVEMENTS_STOJOU` derniers rangements de palette
 * de réception, **du plus récent au plus ancien** (l'ordre du tableau fait foi,
 * il vient du ORDER BY de la requête).
 *
 * Règle :
 *  - ≥ `SEUIL_DOMINANCE_STOJOU` rangements à la même qté → cette qté, confiance 'ok' ;
 *  - sinon (rangements tous différents, ou un seul disponible) → le **plus
 *    récent**, confiance 'faible'. Le plus récent car il reflète le
 *    conditionnement en vigueur : si le fournisseur a changé de palettisation,
 *    l'ancienne valeur est périmée, pas plus vraie parce qu'elle est plus vue.
 *
 * Aucune fenêtre calendaire : un article reçu pour la dernière fois il y a deux
 * ans reste estimable (c'est justement la population dont le référentiel est mal
 * tenu). Le bornage se fait sur le NOMBRE de mouvements, pas sur leur âge.
 */
export function estimerDepuisStojou(obs: PaletteObservation[]): EstimationResult | null {
  const valides = observationsValides(obs.filter((o) => o.source === 'STOJOU')).slice(
    0,
    NB_MOUVEMENTS_STOJOU
  )
  if (valides.length === 0) return null

  const compte = new Map<number, number>()
  for (const o of valides) compte.set(o.us, (compte.get(o.us) ?? 0) + 1)

  // Repli par défaut : le mouvement le plus récent (tête de tableau).
  const plusRecent = valides[0]!.us
  let meilleure = { valeur: plusRecent, occurrences: compte.get(plusRecent) ?? 1 }
  for (const [valeur, occurrences] of compte) {
    if (occurrences > meilleure.occurrences) meilleure = { valeur, occurrences }
  }
  if (meilleure.valeur <= 0) return null

  return {
    usParPalette: meilleure.valeur,
    source: 'STOJOU',
    confiance: meilleure.occurrences >= SEUIL_DOMINANCE_STOJOU ? 'ok' : 'faible',
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
 *  2. Sinon (stock entamé / palette unique / vide), fallback STOJOU : les 3
 *     derniers rangements (palettes complètes au moment du rangement).
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
