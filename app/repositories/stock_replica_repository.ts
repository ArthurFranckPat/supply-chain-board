import db from '@adonisjs/lucid/services/db'
import type { Flow } from '#app/domain/models/flow'

type ReplicaRow = {
  article: string
  physique: number
  controle_qual: number
  rebut: number
  alloue_phys: number
  alloue_global: number
  pmp: number | null
}

function toFlows(row: ReplicaRow): Flow[] {
  const flows: Flow[] = []
  const strict = row.physique - row.alloue_phys - row.alloue_global
  const pmp = row.pmp

  if (strict > 0) {
    flows.push({
      article: row.article,
      quantity: strict,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'strict', pmp },
    })
  }
  if (row.controle_qual > 0) {
    flows.push({
      article: row.article,
      quantity: row.controle_qual,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'qc', pmp },
    })
  }
  if (row.rebut > 0) {
    flows.push({
      article: row.article,
      quantity: row.rebut,
      direction: 'supply',
      date: null,
      origin: { type: 'stock', subType: 'rejected', pmp },
    })
  }
  return flows
}

/**
 * Lecture read-only de `stock_replica` (#98, lot 2).
 *
 * Miroir de `X3StockRepository.getStockFlows()` — même formule exacte (strict =
 * physique - allouePhys - alloueGlobal ; contrôle qualité et rebut en flux à part,
 * cf. décision projet « Q compté dispo »). `stock_replica` est déjà agrégée au
 * grain article par `X3StockRepository.getStockLevels()` à l'ingestion (ITMMVT porte
 * plusieurs lignes par article — une par site) : aucune ré-agrégation nécessaire ici.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable de
 * passer par `replicaGate.canRead('stock_replica')` en amont.
 */
export class StockReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  async getStockFlows(articles?: string[]): Promise<Flow[]> {
    let query = this.conn.from('stock_replica').select('*')
    if (articles && articles.length > 0) {
      query = query.whereIn('article', [...new Set(articles.filter(Boolean))])
    }
    const rows = await query
    return (rows as ReplicaRow[]).flatMap(toFlows)
  }

  /**
   * Base du KPI valorisation : stock actuel et PMP par article — miroir du
   * `INNER JOIN ITMMVT V ... V.STOFCY_0 = 'AE1'` de `buildBaseSql`.
   *
   * `stock` vaut `PHYSTO_0 + CTLSTO_0` (physique + contrôle qualité), la même
   * somme que la voie directe : c'est la décision assumée du projet de compter
   * le statut Q comme du stock détenu. Le rebut en est exclu des deux côtés.
   *
   * ## Équivalence avec le filtre de site, vérifiée
   *
   * L'ingestion agrège `ITMMVT` par article SANS filtrer `STOFCY_0` (elle somme
   * les quantités, prend le MAX du PMP), quand `buildBaseSql` lit la seule ligne
   * `AE1`. Mesuré en PROD sur toute la population `ITMSTA_0 = 1`, trois
   * requêtes, trois fois zéro ligne :
   *
   *  - `MAX(AVC_0) <> AVC_0(AE1)` → 0 article ;
   *  - `SUM(PHYSTO_0+CTLSTO_0) <> Σ(AE1)` → 0 article ;
   *  - article avec une ligne `ITMMVT` mais aucune ligne `AE1` → 0 article.
   *
   * Les lignes à site vide sont donc à zéro sur les quantités ET ne portent
   * jamais un PMP supérieur à celui d'AE1. Le jour où un second site réel
   * apparaît, cette équivalence tombe et l'ingestion doit être scopée.
   *
   * Ne filtre RIEN : la population (stock non nul OU mouvements sur la fenêtre)
   * est décidée par l'appelant, qui seul connaît la fenêtre.
   */
  async getValuationBase(): Promise<Array<{ article: string; stock: number; pmp: number }>> {
    const rows = await this.conn
      .from('stock_replica')
      .select('article', 'physique', 'controle_qual', 'pmp')
    return (rows as ReplicaRow[]).map((r) => ({
      article: r.article,
      stock: r.physique + r.controle_qual,
      pmp: r.pmp ?? 0,
    }))
  }

  /**
   * Stock disponible NON ALLOUÉ par article — miroir du `buildStockSql` de
   * `RetardRepository` (`SUM(PHYSTO_0 - PHYALL_0 - GLOALL_0)` sur ITMMVT).
   *
   * Volontairement distinct de `getStockFlows()` : celui-ci rend trois flux par
   * article (strict / contrôle qualité / rebut), quand le retard veut UN nombre,
   * le seul « strict ». Recomposer l'un depuis l'autre obligerait l'appelant à
   * connaître la convention des sous-types, qui est justement ce que ces
   * repositories encapsulent.
   *
   * Non clampé à zéro ici : `buildStockSql` ne l'est pas non plus, et l'appelant
   * applique déjà `Math.max(0, …)`. Un négatif est un signal (allocations
   * supérieures au physique, régularisation en cours), pas un zéro.
   */
  async getDisponibleByArticle(
    articles: string[]
  ): Promise<Array<{ article: string; disponible: number }>> {
    const unique = [...new Set(articles.filter(Boolean))]
    if (unique.length === 0) return []
    const rows = await this.conn
      .from('stock_replica')
      .select('article', 'physique', 'alloue_phys', 'alloue_global')
      .whereIn('article', unique)
    return (rows as ReplicaRow[]).map((r) => ({
      article: r.article,
      disponible: r.physique - r.alloue_phys - r.alloue_global,
    }))
  }
}

const stockReplicaRepository = new StockReplicaRepository()
export default stockReplicaRepository
