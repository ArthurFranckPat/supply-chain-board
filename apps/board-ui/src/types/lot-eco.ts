export type StatutLot = 'OK' | 'SURDIMENSIONNE' | 'SOUSDIMENSIONNE' | 'DEMANDE_NULLE'

export interface LotEcoArticle {
  article: string
  description: string
  lot_eco: number
  demande_hebdo: number
  couverture_lot_semaines: number
  delai_reappro_jours: number
  couverture_reappro_semaines: number
  ratio_couverture: number
  stock_physique: number
  stock_alloue: number
  stock_disponible: number
  stock_jours: number
  statut: StatutLot
  nb_parents: number
  valeur_stock: number
  lot_optimal: number
  prix_au_lot_eco: number
  prix_au_lot_optimal: number
  economie_immobilisation: number
  surcout_unitaire: number
  code_fournisseur: number
}

export interface LotEcoResponse {
  articles: LotEcoArticle[]
  nb_total: number
  nb_ok: number
  nb_surdimensionne: number
  nb_sousdimensionne: number
  nb_demande_nulle: number
}
