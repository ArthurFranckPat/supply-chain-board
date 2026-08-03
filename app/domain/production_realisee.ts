/**
 * Production réalisée d'un poste — passé constaté du cockpit (#119, lot 2).
 *
 * Domaine pur : aucune I/O, aucun appel X3 ni réplique. Nourri par les
 * pointages d'`operations_trk_replica` (lot 1), produit les mailles jour du
 * graphe de production et la conversion en heures via la cadence de gamme.
 *
 * ## La règle de sélection — pourquoi elle existe
 *
 * Un OF peut passer PLUSIEURS fois sur le même poste (la gamme y repasse,
 * jusqu'à 6 opérations quantifiées relevées pour un même couple OF × poste).
 * Chaque opération quantifiée redéclare la même pièce : sommer les quantités de
 * toutes les opérations compterait la pièce autant de fois que le poste l'a
 * vue. La production d'un OF sur un poste est donc portée par sa DERNIÈRE
 * opération quantifiée — la plus avancée dans la gamme, la plus proche de la
 * sortie du poste. Les déclarations PARTIELLES de cette opération (50 pièces
 * lundi, 50 mardi) sont en revanche des ajouts légitimes : on somme ses
 * pointages, on ne garde pas seulement le dernier.
 *
 * « Dernière » = dernier pointage quantifié le plus récent en date
 * d'imputation ; à égalité de jour, l'OPENUM le plus élevé (le plus avancé dans
 * la gamme). La sélection est recalculée sur l'état courant des pointages :
 * quand une opération plus récente est déclarée, la production historique de
 * l'OF bascule sur elle — c'est voulu, la série du poste reste cohérente avec
 * « ce qui est sorti du poste ».
 *
 * ## Rebut
 *
 * Les pointages dont le rebut est renseigné ne participent pas à la production
 * réalisée (#119) — ni quantité, ni heures, ni sélection d'opération. Le rebut
 * reste hors périmètre v1 ; la valeur n'est pas exposée, seul le fait qu'il y
 * en ait l'est (booléen).
 *
 * ## Heures
 *
 * Deux lectures distinctes, à ne pas mélanger :
 * - les heures POINTÉES (`heures`) : temps réellement passé, somme des temps
 *   opératoires et de réglage des pointages de l'opération sélectionnée. Les
 *   pointages à quantité nulle — réglage pur — portent des heures réelles et
 *   comptent ;
 * - les heures CONVERTIES (`heuresConvertiesParJour`) : la quantité produite
 *   convertie en heures via la cadence de gamme (`hoursForQuantity`), pour
 *   comparer « ce qui a été produit » à la capacité théorique. C'est une
 *   convention de gestion, pas du temps constaté.
 */

import { hoursForQuantity } from '#app/domain/models/gamme'

/** Pointage de suivi de fabrication, tel que lu de la réplique (lot 1). */
export interface PointageTrk {
  numOf: string
  openum: number
  /** Date d'imputation ISO YYYY-MM-DD — la maille du graphe. */
  iptdat: string
  /** Poste réalisé — égalité stricte, jamais de regroupement. */
  cplwst: string
  /** Quantité réalisée — 0 sur les pointages de réglage pur. */
  cplqty: number
  /** Temps opératoire pointé, heures. */
  opetim: number
  /** Temps de réglage pointé, heures. */
  settim: number
  /** Le pointage déclare du rebut (exclu de la production réalisée). */
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

/** Une maille mois (YYYY-MM) — l'affichage du cockpit est mensuel (#119). */
export interface ProductionMois {
  mois: string
  qty: number
  heures: number
  dontHeuresReglage: number
}

/**
 * Mailles jour → mailles mois. Le graphe du cockpit est mensuel, mais le calcul
 * reste journalier en amont : c'est la maille jour qui garantit que les
 * pointages de réglage pur et les déclarations partielles sont comptés avant
 * agrégation. Trié par mois croissant.
 */
export function productionParMois(mailles: ProductionRealisee[]): ProductionMois[] {
  const parMois = new Map<string, ProductionMois>()
  for (const m of mailles) {
    const mois = m.date.slice(0, 7)
    let cur = parMois.get(mois)
    if (!cur) {
      cur = { mois, qty: 0, heures: 0, dontHeuresReglage: 0 }
      parMois.set(mois, cur)
    }
    cur.qty += m.qty
    cur.heures += m.heures
    cur.dontHeuresReglage += m.dontHeuresReglage
  }
  return [...parMois.values()].sort((a, b) => a.mois.localeCompare(b.mois))
}

/** Clé de groupe : un OF sur UN poste — le poste fait partie de l'identité. */
function groupeKey(p: PointageTrk): string {
  return `${p.numOf}#${p.cplwst}`
}

/** Pointage qui compte pour la production : quantité positive et pas de rebut. */
function estQuantifie(p: PointageTrk): boolean {
  return p.cplqty > 0 && !p.rebut
}

/**
 * Sélection de la dernière opération quantifiée par (OF, poste).
 *
 * Rend `numOf#cplwst → openum`. Un groupe sans aucun pointage quantifié
 * (réglage pur, ou uniquement du rebut) n'a PAS d'opération sélectionnée : il
 * ne porte alors ni quantité ni heures — la règle est la même pour les deux
 * lectures, cf. l'en-tête du fichier.
 */
export function selectionDerniereOperationQuantifiee(
  pointages: PointageTrk[]
): Map<string, number> {
  // Par groupe puis par opération : la date du dernier pointage quantifié.
  const derniereQuantification = new Map<string, { iptdat: string; openum: number }>()

  for (const p of pointages) {
    if (!estQuantifie(p)) continue
    const key = groupeKey(p)
    const cur = derniereQuantification.get(key)
    if (!cur || p.iptdat > cur.iptdat || (p.iptdat === cur.iptdat && p.openum > cur.openum)) {
      derniereQuantification.set(key, { iptdat: p.iptdat, openum: p.openum })
    }
  }

  const selection = new Map<string, number>()
  for (const [key, cur] of derniereQuantification) selection.set(key, cur.openum)
  return selection
}

/**
 * Mailles jour de la production réalisée : quantités et heures des opérations
 * sélectionnées, attribuées à la date d'imputation de CHAQUE pointage (les
 * déclarations partielles restent sur leur jour). Trié par date croissante.
 */
export function productionRealiseeParJour(pointages: PointageTrk[]): ProductionRealisee[] {
  const selection = selectionDerniereOperationQuantifiee(pointages)

  const parJour = new Map<string, ProductionRealisee>()
  for (const p of pointages) {
    if (p.rebut) continue
    if (selection.get(groupeKey(p)) !== p.openum) continue

    let maille = parJour.get(p.iptdat)
    if (!maille) {
      maille = { date: p.iptdat, qty: 0, heures: 0, dontHeuresReglage: 0 }
      parJour.set(p.iptdat, maille)
    }
    maille.qty += p.cplqty
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
  const selection = selectionDerniereOperationQuantifiee(pointages)

  const parJour = new Map<string, number>()
  for (const p of pointages) {
    if (!estQuantifie(p)) continue
    if (selection.get(groupeKey(p)) !== p.openum) continue
    if (!p.itmrefOf) continue

    const heures = hoursForQuantity({ rate: rateFor(p.itmrefOf, p.cplwst) ?? 0 }, p.cplqty)
    if (heures <= 0) continue
    parJour.set(p.iptdat, (parJour.get(p.iptdat) ?? 0) + heures)
  }
  return parJour
}
