/**
 * Types + constantes du diagnostic récursif (issue #52 — extrait de
 * components/of/of-detail-sheet.tsx). Partie pure (sans Solid, sans JSX) :
 * miroir client de RecursiveDiagnosticResult côté serveur + maps de rendu.
 *
 * Consommé par l'arbre diagnostic (components/of/of-diagnostic-tree.tsx) et
 * le shell du sheet.
 */

// ---------------------------------------------------------------------------
// Types diagnostic (miroir de RecursiveDiagnosticResult côté serveur)
// ---------------------------------------------------------------------------

export type NodeStatus =
  'ok' | 'qc_a_controler' | 'rupture_matiere' | 'sous_ensemble_a_lancer' | 'indetermine'
export type NodeSource = 'MFGMAT' | 'NOMENCLATURE'

export interface DiagNode {
  numOf: string
  article: string
  description: string
  statut: number
  source: NodeSource
  feasible: boolean
  status: NodeStatus
  shorts: DiagShort[]
  alerts: string[]
}
export interface DiagShort {
  article: string
  description: string
  quantityNeeded: number
  available: number | null
  stockQc?: number
  quantityMissing: number
  earliestReception: string | null
  receptionSupplier?: string
  receptionOrderId?: string
  fabricated: boolean
  covering: DiagCovering[]
  status: NodeStatus
}
export interface DiagCovering {
  numOf: string
  statut: number
  quantity: number
  node: DiagNode
}
export interface DiagResult {
  numOf: string
  article: string
  feasible: boolean
  rootCause: NodeStatus
  tree: DiagNode
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
}

// ---------------------------------------------------------------------------
// Helpers statut (labels / variantes de badge)
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<NodeStatus, string> = {
  ok: 'OK',
  qc_a_controler: 'Contrôle qualité',
  rupture_matiere: 'Rupture matière',
  sous_ensemble_a_lancer: 'Sous-ensemble à lancer',
  indetermine: 'Indéterminé',
}
export type BadgeVariant = 'success' | 'destructive' | 'warning' | 'secondary'
export const STATUS_VARIANT: Record<NodeStatus, BadgeVariant> = {
  ok: 'success',
  qc_a_controler: 'warning',
  rupture_matiere: 'destructive',
  sous_ensemble_a_lancer: 'warning',
  indetermine: 'secondary',
}
export const STATUT_OF: Record<number, string> = { 1: 'ferme', 2: 'planifié', 3: 'suggéré' }

/** Labels courts pour les badges dans l'arbre (espace limité). */
export const TREE_STATUS_LABEL: Record<NodeStatus, string> = {
  ok: 'OK',
  qc_a_controler: 'CQ requis',
  rupture_matiere: 'Rupture',
  sous_ensemble_a_lancer: 'À lancer',
  indetermine: '?',
}

/** ISO YYYY-MM-DD → JJ/MM/AA */
export function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}
