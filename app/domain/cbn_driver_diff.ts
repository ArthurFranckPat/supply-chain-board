import { TOLERANCE_ECHEANCE_JOURS, TOLERANCE_QUANTITE_RATIO } from '#app/domain/appro_decision'
import type { DemandSnapshotRow } from '#app/domain/snapshot_rows'

/**
 * Diff des drivers du CBN par article (#138 lot 1).
 *
 * Les 8 sources de `demand_snapshots` sont figées chaque nuit. Ce module
 * compare deux photos d'un même article et isole ce qui a bougé au-delà du
 * bruit, pour que `cbn_explanation.ts` puisse le corréler à un message du
 * même article.
 *
 * Grain : `(article, source)`, avec appariement par échéance la plus proche
 * pour les sources multi-lignes (comme `appro_snapshot_diff.ts`). `stock` est
 * mono-ligne par article.
 *
 * Pur, sans I/O.
 */

export type DriverSource =
  | 'of_ferme'
  | 'of_planifie'
  | 'of_suggestion'
  | 'demande_ferme'
  | 'demande_prevision'
  | 'stock'
  | 'appro'
  | 'appro_suggestion'

export type DriverDiffNature = 'apparue' | 'disparue' | 'quantite' | 'date'

export interface DriverDiffEntry {
  article: string
  source: DriverSource
  nature: DriverDiffNature
  quantiteAvant: number | null
  quantiteApres: number | null
  echeanceAvant: string | null
  echeanceApres: string | null
  detail: string
  designation: string | null
  famille: string | null
  vcrnum: string | null
  vcrlin: string | null
}

/**
 * Amplitude relative d'une entrée pour le tri (§5.3 PRD : ratio, pas absolu).
 * - `quantite` : |après-avant| / |min(avant,après)|
 * - `apparue` / `disparue` : 1000 + log quantité (toujours en tête mais trié
 *   par volume et entrelacé apparue/disparue, sinon les 1000 premiers sont
 *   tous disparus car `Infinity` stable garde l'ordre d'insertion disparue-first)
 * - `date` : |jours de décalage| / TOLERANCE_ECHEANCE_JOURS
 */
export function driverDiffAmplitude(e: DriverDiffEntry): number {
  if (e.nature === 'apparue' || e.nature === 'disparue') {
    const q = e.nature === 'apparue' ? (e.quantiteApres ?? 0) : (e.quantiteAvant ?? 0)
    return 1000 + Math.log10(Math.abs(q) + 1)
  }
  if (e.nature === 'date') {
    const d = joursEntre(e.echeanceAvant, e.echeanceApres)
    if (d === null) return 0
    return Math.abs(d) / TOLERANCE_ECHEANCE_JOURS
  }
  if (e.quantiteAvant === null || e.quantiteApres === null) return 0
  const base = baseRatio(e.quantiteAvant, e.quantiteApres)
  return Math.abs(e.quantiteApres - e.quantiteAvant) / base
}

const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / 86_400_000)
}

const qte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
const fmtFr = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/**
 * Référence du ratio de variation : la plus petite MAGNITUDE, jamais la plus
 * petite valeur signée.
 *
 * Le stock figé ici est le stock STRICT (physique − alloué), qui passe sous
 * zéro dès que les allocations dépassent le physique. Avec `Math.min(qa, qp)`
 * brut, une chute +100 → −100 donnait `base = -100`, donc `ratio = -2`, et
 * `ratio > 0.2` était FAUX : l'effondrement de stock — le driver de poids 3,
 * celui qui explique un « avancer » — n'était jamais émis. Symétriquement,
 * −100 → +500 disparaissait aussi, alors qu'il explique un « retarder ».
 *
 * Sur deux quantités positives, `Math.abs` ne change rien : le comportement
 * historique est préservé.
 */
const baseRatio = (qa: number, qp: number): number => Math.abs(Math.min(qa, qp)) || 1

const distEcheance = (a: string | null, b: string | null): number => {
  if (a === null && b === null) return 0
  const d = joursEntre(a, b)
  return d === null ? Number.POSITIVE_INFINITY : Math.abs(d)
}

function apparie(
  avant: DemandSnapshotRow[],
  apres: DemandSnapshotRow[]
): {
  paires: Array<[DemandSnapshotRow, DemandSnapshotRow]>
  surplusAvant: DemandSnapshotRow[]
  surplusApres: DemandSnapshotRow[]
} {
  const as = [...avant].sort((x, y) =>
    (x.date_echeance ?? '9').localeCompare(y.date_echeance ?? '9')
  )
  const ps = [...apres].sort((x, y) =>
    (x.date_echeance ?? '9').localeCompare(y.date_echeance ?? '9')
  )
  const usedP = new Set<number>()
  const paires: Array<[DemandSnapshotRow, DemandSnapshotRow]> = []
  const appariees = new Set<DemandSnapshotRow>()
  for (const rowA of as) {
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    ps.forEach((rowP, idx) => {
      if (usedP.has(idx)) return
      const d = distEcheance(rowA.date_echeance, rowP.date_echeance)
      if (d < bestDist) {
        bestDist = d
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
    surplusAvant: as.filter((r) => !appariees.has(r)),
    surplusApres: ps.filter((_, i) => !usedP.has(i)),
  }
}

/**
 * Diff pur des drivers entre deux photos complètes.
 * `avant` = plus ancienne, `apres` = plus récente.
 * Rend une liste plate (un `filter` par article côté appelant suffit).
 */
export function diffCbnDrivers(
  avant: DemandSnapshotRow[],
  apres: DemandSnapshotRow[]
): DriverDiffEntry[] {
  const out: DriverDiffEntry[] = []

  const index = (rows: DemandSnapshotRow[]): Map<string, DemandSnapshotRow[]> => {
    const m = new Map<string, DemandSnapshotRow[]>()
    for (const r of rows) {
      // Pour les suggestions CBN (of_suggestion, appro_suggestion), le VCRNUM est
      // recréé chaque nuit (cf. appro_snapshot_diff.ts) : il n'est pas une clé stable.
      // Les grouper par VCRNUM ferait apparaître chaque suggestion comme disparue/apparue
      // à chaque photo, masquant les vrais mouvements de quantité/date. On garde donc
      // (article, source) pour ces deux sources, et (article, source, vcrnum, vcrlin)
      // pour les autres où la pièce est stable et vérifiable.
      const isSuggestion = r.source === 'of_suggestion' || r.source === 'appro_suggestion'
      const k = isSuggestion
        ? `${r.itmref}\u0001${r.source}`
        : `${r.itmref}\u0001${r.source}\u0001${r.vcrnum ?? ''}\u0001${r.vcrlin ?? ''}`
      const list = m.get(k)
      if (list === undefined) m.set(k, [r])
      else list.push(r)
    }
    return m
  }

  const parCleAvant = index(avant)
  const parCleApres = index(apres)
  const cles = new Set([...parCleAvant.keys(), ...parCleApres.keys()])

  for (const key of cles) {
    const [article, sourceRaw] = key.split('\u0001')
    const source = sourceRaw as DriverSource
    const a = parCleAvant.get(key) ?? []
    const p = parCleApres.get(key) ?? []

    if (a.length === 0) {
      for (const rowP of p) {
        out.push({
          article,
          source,
          nature: 'apparue',
          quantiteAvant: null,
          quantiteApres: rowP.quantity,
          echeanceAvant: null,
          echeanceApres: rowP.date_echeance,
          detail: `${source} apparue : ${qte(rowP.quantity)} unités${rowP.date_echeance ? `, échéance ${fmtFr(rowP.date_echeance)}` : ''} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowP.vcrnum,
          vcrlin: rowP.vcrlin,
        })
      }
      continue
    }

    if (p.length === 0) {
      for (const rowA of a) {
        out.push({
          article,
          source,
          nature: 'disparue',
          quantiteAvant: rowA.quantity,
          quantiteApres: null,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: null,
          detail: `${source} disparue : ${qte(rowA.quantity)} unités${rowA.date_echeance ? `, échéance ${fmtFr(rowA.date_echeance)}` : ''} — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
        })
      }
      continue
    }

    // Cas stock : une seule ligne par article ; comparaison directe sans
    // appariement par échéance (qui n'existe pas).
    if (source === 'stock') {
      const qa = a[0]?.quantity ?? 0
      const qp = p[0]?.quantity ?? 0
      const ratio = Math.abs(qp - qa) / baseRatio(qa, qp)
      if (ratio > TOLERANCE_QUANTITE_RATIO) {
        const sens = qp > qa ? '+' : '−'
        out.push({
          article,
          source,
          nature: 'quantite',
          quantiteAvant: qa,
          quantiteApres: qp,
          echeanceAvant: null,
          echeanceApres: null,
          detail: `Stock ${qte(qa)} → ${qte(qp)} (${sens}${Math.round(ratio * 100)} %) — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: null,
          vcrlin: null,
        })
      }
      continue
    }

    const { paires, surplusAvant, surplusApres } = apparie(a, p)

    for (const [rowA, rowP] of paires) {
      const ratio =
        Math.abs(rowP.quantity - rowA.quantity) / baseRatio(rowA.quantity, rowP.quantity)
      const ecartJours = joursEntre(rowA.date_echeance, rowP.date_echeance)
      const qtyChanged = ratio > TOLERANCE_QUANTITE_RATIO
      const dateChanged = ecartJours !== null && Math.abs(ecartJours) > TOLERANCE_ECHEANCE_JOURS

      if (qtyChanged) {
        const sens = rowP.quantity > rowA.quantity ? '+' : '−'
        out.push({
          article,
          source,
          nature: 'quantite',
          quantiteAvant: rowA.quantity,
          quantiteApres: rowP.quantity,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: rowP.date_echeance,
          detail: `${source} quantité ${qte(rowA.quantity)} → ${qte(rowP.quantity)} (${sens}${Math.round(ratio * 100)} %) — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
        })
      }

      if (dateChanged) {
        out.push({
          article,
          source,
          nature: 'date',
          quantiteAvant: rowA.quantity,
          quantiteApres: rowP.quantity,
          echeanceAvant: rowA.date_echeance,
          echeanceApres: rowP.date_echeance,
          detail: `${source} échéance ${fmtFr(rowA.date_echeance)} → ${fmtFr(rowP.date_echeance)} (${ecartJours! > 0 ? '+' : ''}${ecartJours} j) — ${article}.`,
          designation: null,
          famille: null,
          vcrnum: rowA.vcrnum,
          vcrlin: rowA.vcrlin,
        })
      }
    }

    for (const rowA of surplusAvant) {
      out.push({
        article,
        source,
        nature: 'disparue',
        quantiteAvant: rowA.quantity,
        quantiteApres: null,
        echeanceAvant: rowA.date_echeance,
        echeanceApres: null,
        detail: `${source} ligne disparue : ${qte(rowA.quantity)} unités, échéance ${fmtFr(rowA.date_echeance)} — ${article}.`,
        designation: null,
        famille: null,
        vcrnum: rowA.vcrnum,
        vcrlin: rowA.vcrlin,
      })
    }

    for (const rowP of surplusApres) {
      out.push({
        article,
        source,
        nature: 'apparue',
        quantiteAvant: null,
        quantiteApres: rowP.quantity,
        echeanceAvant: null,
        echeanceApres: rowP.date_echeance,
        detail: `${source} ligne apparue : ${qte(rowP.quantity)} unités, échéance ${fmtFr(rowP.date_echeance)} — ${article}.`,
        designation: null,
        famille: null,
        vcrnum: rowP.vcrnum,
        vcrlin: rowP.vcrlin,
      })
    }
  }

  return out
}
