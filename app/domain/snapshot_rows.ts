/**
 * Types partagés des snapshots (#138 lot 0/1) — extraits pour éviter le cycle
 * `demand_snapshot_service` ↔ `cbn_*_diff`.
 */

export type DemandSnapshotRow = {
  snapshot_date: string
  source: string
  itmref: string
  vcrnum: string | null
  vcrlin: string | null
  quantity: number
  date_echeance: string | null
  fournisseur: string | null
}

export type ApproMessageSnapshotRow = {
  snapshot_date: string
  vcrnum: string
  vcrlin: number
  vcrseq: string
  itmref: string
  fournisseur: string | null
  mrpmes: number
  mrpdat: string | null
  enddat: string | null
  quantity: number
}
