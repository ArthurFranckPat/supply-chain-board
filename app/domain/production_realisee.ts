/**
 * Production réalisée d'un poste — passé constaté du cockpit (#119, lot 2).
 *
 * Domaine pur : aucune I/O, aucun appel X3 ni réplique. Nourri par les
 * pointages d'`operations_trk_replica` (lot 1), produit les mailles jour du
 * graphe de production et la conversion en heures via la cadence de gamme.
 *
 * ## Identité du poste — ÉGALITÉ STRICTE, aucune fusion
 *
 * **Poste retenu `PP_093` ⇒ données de `PP_093`. `CPLWST_0 = 'PP_093'`.
 * Aucune somme, aucun regroupement, aucun repli d'un autre code sur celui-ci.**
 *
 * Les codes suffixés (`PP_093S`) sont des postes DIFFÉRENTS : ils n'entrent ni
 * au sélecteur, ni dans les pointages d'un autre poste, ni dans sa capacité.
 * Règle d'admission : le segment après `PP_` / `PE_` doit être numérique —
 * `PP_MECA`, `PE_PROD`, `PP_093S` sont exclus, sans exception.
 *
 * Interdit de rétablir une troncature « d'identité » ici : elle ramène la
 * fusion des jumeaux par la fenêtre (revue #119, point rouvert trois fois).
 *
 * ## La règle de sélection — pourquoi elle existe
 *
 * Un OF peut passer PLUSIEURS fois sur le même poste (la gamme y repasse,
 * jusqu'à 6 opérations quantifiées relevées pour un même couple OF × poste).
 * Chaque opération quantifiée redéclare la même pièce : sommer les quantités de
 * toutes les opérations compterait la pièce autant de fois que le poste l'a
 * vue. La production d'un OF sur un poste est donc portée par l'opération de
 * plus grand `OPENUM` ayant une quantité > 0 — la plus avancée dans la gamme.
 * Les déclarations PARTIELLES de cette opération (50 pièces lundi, 50 mardi)
 * sont en revanche des ajouts légitimes : on somme ses pointages.
 *
 * ## Rebut
 *
 * `REJCPLQTY` est ingéré et NON EXPOSÉ en v1. Le pointage entier reste compté
 * (`CPLQTY` + heures) : il n'existe pas de pointage de rebut pur — écarter le
 * pointage jetait la production bonne avec le rebut (revue #119).
 *
 * ## Heures vs quantités
 *
 * X3 recopie la même déclaration sur chaque opération de gamme (même qté,
 * temps quasi identiques, même jour) — ce n'est PAS un passage successif
 * (contre-revue #119, F126-48719 / F126-48493). Les heures suivent donc la
 * MÊME sélection que les quantités : opération OPENUM max seule. Repli
 * réglage pur : OF sans aucune op quantifiée → toutes ses heures, qty = 0.
 *
 * heures CONVERTIES (`heuresConvertiesParJour`) : quantité de l'opération
 * sélectionnée via `hoursForQuantity` (convention de gestion).
 */

import { hoursForQuantity } from '#app/domain/models/gamme'
import { calcPalettes } from '#app/domain/receptions'
import { isoDay, mondayOf } from '#app/utils/dates'

/**
 * Poste de production de la ligne : préfixe `PP_` / `PE_` + segment NUMÉRIQUE,
 * sur le code BRUT. Exclut `PP_MECA`, `PE_PROD`… et les codes suffixés comme
 * `PP_093S`, qui sont des postes distincts et ne concernent pas le cockpit.
 */
export function estPosteProduction(code: string): boolean {
  return /^(PP|PE)_\d+$/.test(code.trim())
}

/** Pointage de suivi de fabrication, tel que lu de la réplique (lot 1). */
export interface PointageTrk {
  numOf: string
  openum: number
  /** Date d'imputation ISO YYYY-MM-DD — la maille du graphe. */
  iptdat: string
  /** Poste réalisé — déjà normalisé (6 car.) côté lecteur, ou brut. */
  cplwst: string
  /** Quantité réalisée — 0 sur les pointages de réglage pur. */
  cplqty: number
  /** Temps opératoire pointé, heures. */
  opetim: number
  /** Temps de réglage pointé, heures. */
  settim: number
  /**
   * Signal rebut (valeur non exposée). Aucun calcul ne le lit : il est là pour
   * que les tests puissent démontrer qu'un pointage porteur de rebut compte
   * TOUJOURS sa production et ses heures — la règle inverse avait effacé
   * 401 954 pièces bonnes (revue #119).
   */
  rebut: boolean
  /** Article produit — null si l'OF n'a pas de détail connu. */
  itmrefOf: string | null
}

/** Une maille jour de la production réalisée d'un poste. */
export interface ProductionRealisee {
  date: string
  qty: number
  /** Heures pointées (temps opératoire + réglage). */
  heures: number
  dontHeuresReglage: number
}

/**
 * Écarte les pointages hors postes de production. Le code n'est JAMAIS réécrit :
 * un pointage de `PP_093S` reste un pointage de `PP_093S` — et se trouve donc
 * simplement exclu, comme `PP_MECA`.
 */
export function filtrerPointagesProduction(pointages: PointageTrk[]): PointageTrk[] {
  return pointages.filter((p) => estPosteProduction(p.cplwst))
}

/**
 * Mailles jour → mailles mois. La clé reste dans `date` (YYYY-MM) pour que les
 * trois maillages (jour/semaine/mois) aient la MÊME forme côté écran. Le calcul
 * reste journalier en amont : c'est la maille jour qui garantit que les
 * pointages de réglage pur et les déclarations partielles sont comptés avant
 * agrégation. Trié croissant.
 */
export function productionParMois(mailles: ProductionRealisee[]): ProductionRealisee[] {
  const parMois = new Map<string, ProductionRealisee>()
  for (const m of mailles) {
    const mois = m.date.slice(0, 7)
    let cur = parMois.get(mois)
    if (!cur) {
      cur = { date: mois, qty: 0, heures: 0, dontHeuresReglage: 0 }
      parMois.set(mois, cur)
    }
    cur.qty += m.qty
    cur.heures += m.heures
    cur.dontHeuresReglage += m.dontHeuresReglage
  }
  return [...parMois.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Clé de groupe : un OF sur UN poste — code brut, égalité stricte. */
function groupeKey(p: PointageTrk): string {
  return `${p.numOf}#${p.cplwst}`
}

/** Pointage qui compte pour la quantité : quantité positive. */
function estQuantifie(p: PointageTrk): boolean {
  return p.cplqty > 0
}

/**
 * Sélection de l'opération de plus grand OPENUM ayant une quantité > 0, par
 * (OF, poste). Règle verrouillée #119 — pas la dernière date d'imputation.
 *
 * Rend `numOf#cplwst → openum`. Un groupe sans aucun pointage quantifié
 * (réglage pur) n'a PAS d'opération sélectionnée : les lecteurs appliquent
 * alors leur repli (heures de réglage comptées, quantité nulle).
 */
export function selectionOperationMaxQuantifiee(pointages: PointageTrk[]): Map<string, number> {
  const selection = new Map<string, number>()

  for (const p of pointages) {
    if (!estQuantifie(p)) continue
    const key = groupeKey(p)
    const cur = selection.get(key)
    if (cur === undefined || p.openum > cur) selection.set(key, p.openum)
  }

  return selection
}

/**
 * Mailles jour de la production réalisée :
 *
 * - QUANTITÉS et HEURES : opération sélectionnée (OPENUM max quantifié) —
 *   X3 recopie la déclaration sur chaque op de gamme, sommer les heures
 *   multiplierait la charge ×N (contre-revue #119) ;
 * - Repli réglage pur : sans opération quantifiée, toutes les heures comptent,
 *   quantité nulle.
 *
 * Chaque pointage reste sur sa date d'imputation (déclarations partielles).
 * Trié par date croissante.
 */
export function productionRealiseeParJour(pointages: PointageTrk[]): ProductionRealisee[] {
  const filtrés = filtrerPointagesProduction(pointages)
  const selection = selectionOperationMaxQuantifiee(filtrés)

  const parJour = new Map<string, ProductionRealisee>()
  for (const p of filtrés) {
    const openumSelectionne = selection.get(groupeKey(p))
    const surOperationSelectionnee = openumSelectionne === p.openum
    const repliReglagePur = openumSelectionne === undefined
    if (!surOperationSelectionnee && !repliReglagePur) continue

    let maille = parJour.get(p.iptdat)
    if (!maille) {
      maille = { date: p.iptdat, qty: 0, heures: 0, dontHeuresReglage: 0 }
      parJour.set(p.iptdat, maille)
    }
    if (surOperationSelectionnee) maille.qty += p.cplqty
    maille.heures += p.opetim + p.settim
    maille.dontHeuresReglage += p.settim
  }

  return [...parJour.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * La même quantité, lue en HEURES DE GAMME : `qty / cadence` via
 * `hoursForQuantity`, par (article, poste). Sert la courbe « production
 * convertie » du graphe heures vs capacité — une convention de gestion, pas du
 * temps constaté.
 *
 * `rateFor` rend la cadence (unités/heure) d'un couple (article, poste), ou
 * `null` si la gamme ne porte pas ce couple : la quantité compte alors pour
 * zéro heure (convention `hoursForQuantity`), jamais une estimation.
 *
 * Rend `date → heures converties`, uniquement les jours à production.
 */
export function heuresConvertiesParJour(
  pointages: PointageTrk[],
  rateFor: (article: string, poste: string) => number | null
): Map<string, number> {
  const filtrés = filtrerPointagesProduction(pointages)
  const selection = selectionOperationMaxQuantifiee(filtrés)

  const parJour = new Map<string, number>()
  for (const p of filtrés) {
    if (!estQuantifie(p)) continue
    if (selection.get(groupeKey(p)) !== p.openum) continue
    if (!p.itmrefOf) continue

    const heures = hoursForQuantity({ rate: rateFor(p.itmrefOf, p.cplwst) ?? 0 }, p.cplqty)
    if (heures <= 0) continue
    parJour.set(p.iptdat, (parJour.get(p.iptdat) ?? 0) + heures)
  }
  return parJour
}

/**
 * Mailles jour → mailles SEMAINE. La clé est le LUNDI de la semaine (ISO),
 * stable et triable — pas un numéro de semaine qui perd l'année. Les heures et
 * le réglage suivent la même agrégation que les quantités.
 */
export function productionParSemaine(mailles: ProductionRealisee[]): ProductionRealisee[] {
  const parSemaine = new Map<string, ProductionRealisee>()
  for (const m of mailles) {
    const lundi = isoDay(mondayOf(new Date(`${m.date}T00:00:00`)))
    let cur = parSemaine.get(lundi)
    if (!cur) {
      cur = { date: lundi, qty: 0, heures: 0, dontHeuresReglage: 0 }
      parSemaine.set(lundi, cur)
    }
    cur.qty += m.qty
    cur.heures += m.heures
    cur.dontHeuresReglage += m.dontHeuresReglage
  }
  return [...parSemaine.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Le résumé d'un OF sur le poste — porte les analyses (lots 6) et la liste des
 *  OF terminés. Mêmes règles de sélection que la production. */
export interface SyntheseOf {
  numOf: string
  /** Article produit — null si l'OF n'a pas de détail connu. */
  article: string | null
  qty: number
  heures: number
  /** Heures de réglage incluses dans `heures` — la fiabilité des temps de
   *  gamme compare l'opératoire à l'opératoire, le réglage n'a pas de
   *  standard dans `hoursForQuantity` (revue #119, 04/08). */
  dontHeuresReglage: number
  /** Jours (ISO) où l'OF a pointé, triés — sert l'adhérence au programme. */
  joursPointes: string[]
  premierJour: string
  dernierJour: string
}

/**
 * Un résumé par OF : quantité ET heures de l'opération sélectionnée (même
 * règle — X3 recopie la déclaration sur chaque op). Un OF sans opération
 * quantifiée (réglage pur) apparaît avec `qty = 0` et ses heures réelles.
 */
export function syntheseParOf(pointages: PointageTrk[]): SyntheseOf[] {
  const filtrés = filtrerPointagesProduction(pointages)
  const selection = selectionOperationMaxQuantifiee(filtrés)

  const parOf = new Map<string, SyntheseOf & { jours: Set<string> }>()
  for (const p of filtrés) {
    const openumSelectionne = selection.get(groupeKey(p))
    const surOperationSelectionnee = openumSelectionne === p.openum
    const repliReglagePur = openumSelectionne === undefined
    if (!surOperationSelectionnee && !repliReglagePur) continue

    let cur = parOf.get(p.numOf)
    if (!cur) {
      cur = {
        numOf: p.numOf,
        article: p.itmrefOf,
        qty: 0,
        heures: 0,
        dontHeuresReglage: 0,
        jours: new Set(),
        joursPointes: [],
        premierJour: p.iptdat,
        dernierJour: p.iptdat,
      }
      parOf.set(p.numOf, cur)
    }
    if (surOperationSelectionnee) cur.qty += p.cplqty
    cur.heures += p.opetim + p.settim
    cur.dontHeuresReglage += p.settim
    cur.jours.add(p.iptdat)
    if (p.iptdat < cur.premierJour) cur.premierJour = p.iptdat
    if (p.iptdat > cur.dernierJour) cur.dernierJour = p.iptdat
  }

  return [...parOf.values()]
    .map(({ jours, ...reste }) => ({ ...reste, joursPointes: [...jours].sort() }))
    .sort((a, b) => a.numOf.localeCompare(b.numOf))
}

/** Équivalent palette d'une MAILLE — null = absence de coefficient, pas zéro. */
export interface PalettesMaille {
  date: string
  palettes: number | null
}

/**
 * Équivalent palette de la production, par jour/semaine/mois. Réutilise
 * `calcPalettes` (`app/domain/receptions.ts`) — JAMAIS réécrit.
 *
 * Règle d'agrégation (revue #119) : sommer les quantités de la maille par
 * article, PUIS convertir une fois via `calcPalettes`. Appliquer le ceil par
 * pointage gonflait les palettes (4 déclarations partielles → 4 palettes là
 * où il en faut 2).
 *
 * Règle d'absence (#119) : si aucune quantité de la maille n'est convertible,
 * la maille vaut `null` (absence de donnée), jamais 0.
 */
export function palettesRealisees(
  pointages: PointageTrk[],
  usParPalette: (article: string) => number | null
): { parJour: PalettesMaille[]; parSemaine: PalettesMaille[]; parMois: PalettesMaille[] } {
  const filtrés = filtrerPointagesProduction(pointages)
  const selection = selectionOperationMaxQuantifiee(filtrés)

  // Jour → article → qty cumulée (opération sélectionnée seulement).
  const qtyParJourArticle = new Map<string, Map<string, number>>()
  for (const p of filtrés) {
    if (!estQuantifie(p)) continue
    if (selection.get(groupeKey(p)) !== p.openum) continue
    if (!p.itmrefOf) continue

    let parArticle = qtyParJourArticle.get(p.iptdat)
    if (!parArticle) {
      parArticle = new Map()
      qtyParJourArticle.set(p.iptdat, parArticle)
    }
    parArticle.set(p.itmrefOf, (parArticle.get(p.itmrefOf) ?? 0) + p.cplqty)
  }

  const mailleJour: PalettesMaille[] = [...qtyParJourArticle.entries()]
    .map(([date, parArticle]) => {
      let palettes = 0
      let convertible = false
      for (const [article, qty] of parArticle) {
        const coef = usParPalette(article)
        if (coef && coef > 0) {
          palettes += calcPalettes(qty, coef)
          convertible = true
        }
      }
      return { date, palettes: convertible ? palettes : null }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const regroupe = (clef: (date: string) => string): PalettesMaille[] => {
    // Re-agrège les qtés jour→maille avant conversion, pour ne pas cumuler des
    // ceil déjà appliqués. On repart des qtés article/jour.
    const qtyParMailleArticle = new Map<string, Map<string, number>>()
    for (const [jour, parArticle] of qtyParJourArticle) {
      const k = clef(jour)
      let cur = qtyParMailleArticle.get(k)
      if (!cur) {
        cur = new Map()
        qtyParMailleArticle.set(k, cur)
      }
      for (const [article, qty] of parArticle) {
        cur.set(article, (cur.get(article) ?? 0) + qty)
      }
    }
    return [...qtyParMailleArticle.entries()]
      .map(([date, parArticle]) => {
        let palettes = 0
        let convertible = false
        for (const [article, qty] of parArticle) {
          const coef = usParPalette(article)
          if (coef && coef > 0) {
            palettes += calcPalettes(qty, coef)
            convertible = true
          }
        }
        return { date, palettes: convertible ? palettes : null }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  return {
    parJour: mailleJour,
    parSemaine: regroupe((d) => isoDay(mondayOf(new Date(`${d}T00:00:00`)))),
    parMois: regroupe((d) => d.slice(0, 7)),
  }
}
