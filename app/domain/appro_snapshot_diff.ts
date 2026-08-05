import { TOLERANCE_ECHEANCE_JOURS, TOLERANCE_QUANTITE_RATIO } from '#app/domain/appro_decision'

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

/** Distance d'échéance pour l'appariement : deux échéances absentes s'apparient
 *  (une ligne sans date n'est pas une ligne différente), réel vs absent = jamais. */
const distEcheance = (a: string | null, b: string | null): number => {
  if (a === null && b === null) return 0
  const d = joursEntre(a, b)
  return d === null ? Number.POSITIVE_INFINITY : Math.abs(d)
}

/** Apparie les lignes de deux photos d'un même couple, par échéance la plus proche. */
function apparie(
  avant: ApproSnapshotRow[],
  apres: ApproSnapshotRow[]
): {
  paires: Array<[ApproSnapshotRow, ApproSnapshotRow]>
  surplusAvant: ApproSnapshotRow[]
  surplusApres: ApproSnapshotRow[]
} {
  const as = [...avant].sort((x, y) => (x.echeance ?? '9').localeCompare(y.echeance ?? '9'))
  const ps = [...apres].sort((x, y) => (x.echeance ?? '9').localeCompare(y.echeance ?? '9'))
  const usedP = new Set<number>()
  const paires: Array<[ApproSnapshotRow, ApproSnapshotRow]> = []
  for (const rowA of as) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    ps.forEach((rowP, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(rowA.echeance, rowP.echeance)
      if (d < bestDist) {
        bestDist = d
        best = idx
      }
    })
    if (best === -1) continue
    usedP.add(best)
    paires.push([rowA, ps[best]])
  }
  return {
    paires,
    surplusAvant: as.filter((rowA) => !paires.some(([a]) => a === rowA)),
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
  const couples = new Set([...avant, ...apres].map(cle))

  for (const key of couples) {
    const [fournisseur, article] = key.split('\u0001')
    const a = avant.filter((r) => cle(r) === key)
    const p = apres.filter((r) => cle(r) === key)

    if (a.length === 0) {
      for (const rowP of p) {
        out.push({
          nature: 'apparue',
          article,
          fournisseur: fournisseur || null,
          quantite: rowP.quantite,
          echeance: rowP.echeance,
          detail: `Suggestion apparue : ${qte(rowP.quantite)} unités${rowP.echeance === null ? '' : `, échéance ${rowP.echeance}`}.`,
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
          detail: `Suggestion disparue : ${qte(rowA.quantite)} unités${rowA.echeance === null ? '' : `, échéance ${rowA.echeance}`}.`,
        })
      }
      continue
    }

    const { paires, surplusAvant, surplusApres } = apparie(a, p)

    for (const [rowA, rowP] of paires) {
      const base = Math.min(rowA.quantite, rowP.quantite) || 1
      const ratio = Math.abs(rowP.quantite - rowA.quantite) / base
      const ecartJours = joursEntre(rowA.echeance, rowP.echeance)
      const qtyChanged = ratio > TOLERANCE_QUANTITE_RATIO
      const dateChanged = ecartJours !== null && Math.abs(ecartJours) > TOLERANCE_ECHEANCE_JOURS
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
          detail: `Échéance ${rowA.echeance} → ${rowP.echeance} (${ecartJours! > 0 ? '+' : ''}${ecartJours} j) — seuil ±${TOLERANCE_ECHEANCE_JOURS} j (#112).`,
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
        detail: `Ligne disparue : ${qte(rowA.quantite)} unités, échéance ${rowA.echeance ?? 'inconnue'}.`,
      })
    }
    for (const rowP of surplusApres) {
      out.push({
        nature: 'apparue',
        article,
        fournisseur: fournisseur || null,
        quantite: rowP.quantite,
        echeance: rowP.echeance,
        detail: `Ligne apparue : ${qte(rowP.quantite)} unités, échéance ${rowP.echeance ?? 'inconnue'}.`,
      })
    }
  }

  return out
}
