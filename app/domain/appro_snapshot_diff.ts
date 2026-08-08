import {
  TOLERANCE_APPARIEMENT_JOURS,
  TOLERANCE_ECHEANCE_JOURS,
  TOLERANCE_QUANTITE_RATIO,
} from '#app/domain/appro_decision'
import { fmtFr } from '#app/utils/dates'

/**
 * Diff inter-CBN des suggestions d'achat (#133, item « Not yet specified » #106).
 *
 * Le CBN recrée toute la population chaque nuit (`VCRNUM` non stable, #108) :
 * deux photos successives se comparent donc sur le contenu, pas sur le numéro.
 * Le grain du diff est le **couple (fournisseur, article)** — la maille de la
 * décision d'achat (#110) — et les tolérances de la décision #112 :
 * quantité ≈ ±20 %, échéance ≈ ±7 j.
 *
 * Verdicts rendus par ligne :
 * - `apparue` — le couple n'avait aucune ligne à la photo précédente ;
 * - `disparue` — le couple n'a plus de ligne à la photo suivante ;
 * - `quantite` — la ligne appariée a bougé de plus de ±20 % ;
 * - `date` — l'échéance appariée a bougé de plus de ±7 j.
 *
 * Une ligne qui ne bouge pas dans les tolérances n'est PAS rapportée : le diff
 * ne montre que ce qui a changé. Pur, sans I/O — testable sur fixtures.
 *
 * Les seuils viennent de `appro_decision.ts` : c'est la même tolérance #112 qui
 * décide ici « la ligne a bougé » et là-bas « la décision passée ne vaut plus ».
 * Une seule définition, sinon les deux dérivent.
 */

/** Une ligne de la photo des suggestions (`demand_snapshots`, source `appro_suggestion`). */
export interface ApproSnapshotRow {
  article: string
  fournisseur: string | null
  quantite: number
  /** Échéance ISO (`YYYY-MM-DD`). `null` si absente. */
  echeance: string | null
}

export type ApproDiffNature = 'apparue' | 'disparue' | 'quantite' | 'date'

export interface ApproDiffEntry {
  nature: ApproDiffNature
  article: string
  fournisseur: string | null
  quantite: number
  echeance: string | null
  /** Preuve en clair, pour l'affichage (« quantité 1 000 → 1 500 (+50 %) »). */
  detail: string
}

const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / 86_400_000)
}

const qte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })

const baseRatio = (qa: number, qp: number): number => Math.abs(Math.min(qa, qp)) || 1

const estTransitionEcheance = (a: string | null, b: string | null): boolean =>
  (a === null) !== (b === null)

/** Distance d'échéance pour l'appariement : deux échéances absentes s'apparient
 *  (une ligne sans date n'est pas une ligne différente), réel vs absent = jamais. */
const distEcheance = (a: string | null, b: string | null): number => {
  if (a === null && b === null) return 0
  if (a === null || b === null) return Number.POSITIVE_INFINITY
  const d = joursEntre(a, b)
  return d === null ? Number.POSITIVE_INFINITY : Math.abs(d)
}

/**
 * Apparie les lignes de deux photos d'un même couple, par échéance la plus proche.
 *
 * Miroir de `cbn_driver_diff.apparie()` adapté au grain (fournisseur × article)
 * — plafond, départage et deux passes identiques (#144, #148). Toute évolution
 * du plafond ou du garde-fou quantité doit être portée dans les deux fichiers.
 *
 * @param plafondJours distance au-delà de laquelle deux lignes ne sont pas le
 *   même besoin. Requis, comme dans le miroir `cbn_driver_diff.apparie()` : un
 *   défaut implicite laisserait un futur appelant oublier de trancher la
 *   question, silencieusement. `Infinity` = identité certaine (jamais utilisé
 *   ici : les suggestions sont régénératives, l'identité est toujours devinée).
 */
function apparie(
  avant: ApproSnapshotRow[],
  apres: ApproSnapshotRow[],
  plafondJours: number
): {
  paires: Array<[ApproSnapshotRow, ApproSnapshotRow]>
  surplusAvant: ApproSnapshotRow[]
  surplusApres: ApproSnapshotRow[]
} {
  const as = [...avant].sort((x, y) => (x.echeance ?? '9').localeCompare(y.echeance ?? '9'))
  const ps = [...apres].sort((x, y) => (x.echeance ?? '9').localeCompare(y.echeance ?? '9'))
  const usedP = new Set<number>()
  const paires: Array<[ApproSnapshotRow, ApproSnapshotRow]> = []
  // Un couple porte quelques lignes au plus : le quadratique reste ici, borné
  // par la taille d'un couple, pas par celle de la photo.
  const appariees = new Set<ApproSnapshotRow>()

  // Passe 1 — appariement par échéance la plus proche, borné par le plafond.
  // Les couples non comparables (une seule échéance nulle → Infinity) sont
  // écartés : sans ce garde-fou le départage à quantité minimale les
  // sélectionnerait (`Infinity === Infinity`).
  // Au-delà du plafond deux lignes ne sont pas le même besoin (#144) : on ne
  // marie pas une suggestion de septembre à une de février (+168 j) simplement
  // parce que c'est ce qui reste de libre.
  // Pas de garde-fou quantité ici : deux lignes sans échéance (distance 0) se
  // marient quelle que soit leur quantité — comportement assumé, verrouillé par
  // test. Le départage quantité ne choisit que la plus proche, sans rejet.
  for (const rowA of as) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    let bestQtyDelta = Number.POSITIVE_INFINITY
    ps.forEach((rowP, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(rowA.echeance, rowP.echeance)
      if (d === Number.POSITIVE_INFINITY) return
      if (d > plafondJours) return
      const qtyDelta = Math.abs(rowP.quantite - rowA.quantite)
      if (d < bestDist || (d === bestDist && qtyDelta < bestQtyDelta)) {
        bestDist = d
        bestQtyDelta = qtyDelta
        best = idx
      }
    })
    if (best === -1) continue
    usedP.add(best)
    appariees.add(rowA)
    paires.push([rowA, ps[best]])
  }

  // Passe 2 — rattrapage à la quantité la plus proche.
  //
  // Reçoit les transitions (null ↔ renseignée, incomparables en passe 1), les
  // écarts de cardinalité, ET les orphelines lointaines (> plafond). Ces
  // dernières se marieraient à n'importe quelle ligne sans échéance puisque
  // `Infinity` est exempté du plafond : c'est le défaut qui rentre par la porte
  // de service, avec un `quantite(100 → 5000)` inventé.
  //
  // Le garde-fou de quantité (±20 %, seuil de bruit) ne s'applique qu'à CETTE
  // passe, pas à la passe 1 : il refuse le mariage quand la quantité a bougé
  // au-delà du bruit EN PLUS d'une échéance incohérente (retraits des orphelines
  // lointaines et transitions) — rien n'atteste alors que c'est la même ligne.
  // Le plafond, lui, continue de borner les couples dont les DEUX échéances
  // existent, armé quand l'identité est inférée (toujours ici : `plafondJours`
  // fini).
  const identiteInferee = Number.isFinite(plafondJours)
  for (const rowA of as) {
    if (appariees.has(rowA)) continue
    let best = -1
    let bestQtyDelta = Number.POSITIVE_INFINITY
    ps.forEach((rowP, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(rowA.echeance, rowP.echeance)
      if (d !== Number.POSITIVE_INFINITY && d > plafondJours) return
      const qtyDelta = Math.abs(rowP.quantite - rowA.quantite)
      const qtyRatio = qtyDelta / baseRatio(rowA.quantite, rowP.quantite)
      if (identiteInferee && qtyRatio > TOLERANCE_QUANTITE_RATIO) return
      if (qtyDelta < bestQtyDelta) {
        bestQtyDelta = qtyDelta
        best = idx
      }
    })
    if (best === -1) continue
    usedP.add(best)
    appariees.add(rowA)
    paires.push([rowA, ps[best]])
  }

  return {
    paires,
    surplusAvant: as.filter((rowA) => !appariees.has(rowA)),
    surplusApres: ps.filter((_, i) => !usedP.has(i)),
  }
}

/** Diff pur entre deux photos. `avant` = la plus ancienne, `apres` = la plus récente. */
export function diffApproSnapshots(
  avant: ApproSnapshotRow[],
  apres: ApproSnapshotRow[]
): ApproDiffEntry[] {
  const out: ApproDiffEntry[] = []
  const cle = (r: ApproSnapshotRow): string => `${r.fournisseur ?? ''}\u0001${r.article}`

  // Indexation par couple en un passage sur chaque photo. Un `filter` par couple
  // relisait la photo ENTIÈRE à chaque tour : sur les ~5 600 suggestions du parc
  // AE1 et presque autant de couples, cela faisait des dizaines de millions de
  // comparaisons pour un diff qui n'en demande aucune.
  const index = (rows: ApproSnapshotRow[]): Map<string, ApproSnapshotRow[]> => {
    const m = new Map<string, ApproSnapshotRow[]>()
    for (const r of rows) {
      const k = cle(r)
      const list = m.get(k)
      if (list === undefined) m.set(k, [r])
      else list.push(r)
    }
    return m
  }
  const parCoupleAvant = index(avant)
  const parCoupleApres = index(apres)
  const couples = new Set([...parCoupleAvant.keys(), ...parCoupleApres.keys()])

  for (const key of couples) {
    const [fournisseur, article] = key.split('\u0001')
    const a = parCoupleAvant.get(key) ?? []
    const p = parCoupleApres.get(key) ?? []

    if (a.length === 0) {
      for (const rowP of p) {
        out.push({
          nature: 'apparue',
          article,
          fournisseur: fournisseur || null,
          quantite: rowP.quantite,
          echeance: rowP.echeance,
          detail: `Suggestion apparue : ${qte(rowP.quantite)} unités${rowP.echeance === null ? '' : `, échéance ${fmtFr(rowP.echeance)}`}.`,
        })
      }
      continue
    }
    if (p.length === 0) {
      for (const rowA of a) {
        out.push({
          nature: 'disparue',
          article,
          fournisseur: fournisseur || null,
          quantite: rowA.quantite,
          echeance: rowA.echeance,
          detail: `Suggestion disparue : ${qte(rowA.quantite)} unités${rowA.echeance === null ? '' : `, échéance ${fmtFr(rowA.echeance)}`}.`,
        })
      }
      continue
    }

    const { paires, surplusAvant, surplusApres } = apparie(a, p, TOLERANCE_APPARIEMENT_JOURS)

    for (const [rowA, rowP] of paires) {
      const base = baseRatio(rowA.quantite, rowP.quantite)
      const ratio = Math.abs(rowP.quantite - rowA.quantite) / base
      const ecartJours = joursEntre(rowA.echeance, rowP.echeance)
      const qtyChanged = ratio > TOLERANCE_QUANTITE_RATIO
      const transitionEcheance = estTransitionEcheance(rowA.echeance, rowP.echeance)
      const dateChanged =
        transitionEcheance ||
        (ecartJours !== null && Math.abs(ecartJours) > TOLERANCE_ECHEANCE_JOURS)
      if (qtyChanged) {
        const sens = rowP.quantite > rowA.quantite ? '+' : '−'
        out.push({
          nature: 'quantite',
          article,
          fournisseur: fournisseur || null,
          quantite: rowP.quantite,
          echeance: rowP.echeance,
          detail: `Quantité ${qte(rowA.quantite)} → ${qte(rowP.quantite)} (${sens}${Math.round(ratio * 100)} %) — seuil ±${Math.round(TOLERANCE_QUANTITE_RATIO * 100)} % (#112).`,
        })
      }
      if (dateChanged) {
        out.push({
          nature: 'date',
          article,
          fournisseur: fournisseur || null,
          quantite: rowP.quantite,
          echeance: rowP.echeance,
          detail: `Échéance ${fmtFr(rowA.echeance)} → ${fmtFr(rowP.echeance)}${ecartJours === null ? '' : ` (${ecartJours > 0 ? '+' : ''}${ecartJours} j)`} — seuil ±${TOLERANCE_ECHEANCE_JOURS} j (#112).`,
        })
      }
    }
    for (const rowA of surplusAvant) {
      out.push({
        nature: 'disparue',
        article,
        fournisseur: fournisseur || null,
        quantite: rowA.quantite,
        echeance: rowA.echeance,
        detail: `Ligne disparue : ${qte(rowA.quantite)} unités, échéance ${rowA.echeance === null ? 'inconnue' : fmtFr(rowA.echeance)}.`,
      })
    }
    for (const rowP of surplusApres) {
      out.push({
        nature: 'apparue',
        article,
        fournisseur: fournisseur || null,
        quantite: rowP.quantite,
        echeance: rowP.echeance,
        detail: `Ligne apparue : ${qte(rowP.quantite)} unités, échéance ${rowP.echeance === null ? 'inconnue' : fmtFr(rowP.echeance)}.`,
      })
    }
  }

  return out
}
