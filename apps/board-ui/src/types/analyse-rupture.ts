export interface PoolContrib {
  article: string
  description: string
  categorie: string // "COMPOSANT" | "SF" | "PF"
  stock_utilise: number
  ratio_cumule: number
  contribution: number
  parent_article?: string | null
}

export interface AnalyseRuptureResponse {
  component: {
    code: string
    description: string
    stock_physique: number
    stock_alloue: number
    stock_disponible: number
    stock_disponible_projete: number
    deficit: number
    deficit_projete: number
    pool_total: number
    pool_repartition: PoolContrib[]
  }
  commandes_bloquees: Array<{
    num_commande: string
    client: string
    article: string
    qte_restante: number
    date_expedition: string
    nature: string
    type_commande: string
    chemin_impact: string[]
    ofs_bloquants: Array<{
      num_of: string
      article: string
      qte_a_fabriquer: number
      qte_restante: number
      date_fin: string
      statut: string
      postes_charge: string[]
      composants_alloues?: boolean
    }>
    qte_impact_composant: number
    proj_pool: number
    etat: 'RUPTURE' | 'OK'
    matching_method?: string
    branch_key?: string
    branch_pool_total?: number | null
  }>
  ofs_sans_commande: Array<{
    num_of: string
    article: string
    qte_a_fabriquer: number
    qte_restante: number
    date_fin: string
    statut: string
    postes_charge: string[]
    composants_alloues?: boolean
  }>
  summary: {
    total_blocked_ofs: number
    total_affected_orders: number
    affected_lines: string[]
    max_bom_depth: number
    total_nodes_visited: number
    truncated: boolean
  }
  include_previsions: boolean
  include_receptions: boolean
  use_pool: boolean
  merge_branches: boolean
  include_sf: boolean
  include_pf: boolean
}
