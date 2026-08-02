/**
 * Détail OF — miroir client de SchedulerController.loadOfDetail() (DetailPayload).
 * Servi en JSON par GET /api/v1/planning/ofs/:of/detail, consommé par <OfDetailSheet>.
 */

export interface StatItem {
  label: string
  value: string
  sub: string | null
  valueClass: string
  trend: string | null
  trendClass: string
}

export interface BomRow {
  id: string
  name: string
  stock: string
  need: string
  unit: string
  ok: boolean
  shortage: string | null
  /**
   * Quantité couverte uniquement par du stock sous contrôle qualité (statut Q).
   * Non nul → ligne « ok » mais non lançable tant que le contrôle réception n'a pas libéré.
   */
  qc?: string | null
  /**
   * Conso réelle (USEQTY) / besoin théorique total (RETQTY) — issue #95. null si BOM
   * théorique (OF non éclaté, pas de MFGMAT).
   */
  consumed?: string | null
  required?: string | null
}

/** Commande cliente allouée à l'OF (matcher board + repli peg). */
export interface OfCommandeLink {
  numCommande: string
  ligne: string | null
  client: string | null
  livraisonIso: string | null
  /** 'matcher' = CommandeOFMatcher ; 'peg' = contremarque X3. */
  method: 'matcher' | 'peg'
}

export interface OfDetail {
  num: string
  title: string
  article: string
  statusLabel: string
  statusIcon: string
  statusClass: string
  context: string
  stats: StatItem[]
  progressPct: number
  operator: { initials: string; name: string }
  createdAt: string
  cycle: { start: string; end: string }
  bomCount: number
  bomBlocked: number
  bom: BomRow[]
  events: { label: string; time: string; desc: string | null; dot: string }[]
  /** Commandes associées (matching). Absente/vide si aucune. */
  commandes?: OfCommandeLink[]
}
