import db from '@adonisjs/lucid/services/db'
import type { StockFluxDocRow } from '#repositories/stock_flux_repository'

/**
 * Lecture read-only de `stock_flux_replica` (#98, lot 3 — scoping du
 * 30/07/2026). Miroir de `StockFluxRepository.getFluxNetByDocument()` : même
 * grain (article, jour, document), même bornes [from, to] inclusives.
 *
 * Consommée par `stock_valuation_repository.getStockValuationKpi()` derrière
 * `replicaGate.canRead('stock_flux_replica')` + deux vérifications SÉPARÉES,
 * pas une seule :
 *  - `getCoverage().min` — la réplique a-t-elle assez d'HISTOIRE pour `from` ?
 *    Question de DONNÉES : si l'utilisateur pointe une plage `pinned` plus
 *    ancienne que la fenêtre 12 mois répliquée, aucune fraîcheur de run n'y
 *    changera rien.
 *  - `getLastFullRunAgeMs()` — le dernier run est-il assez RÉCENT ? Question de
 *    TEMPS, pas de données. `MAX(jour)` a été essayé et rejeté pour ça : sur un
 *    site avec peu de mouvements un jour donné (ou X3 test, dont l'activité
 *    STOJOU récente est en pratique quasi nulle — mesuré le 30/07/2026),
 *    `MAX(jour)` reste en retard sur « aujourd'hui » même juste après un run
 *    parfaitement à jour. `MAX(jour)` ne peut pas distinguer « pas encore
 *    synchronisé » de « synchronisé, mais rien à synchroniser ce jour-là ».
 */
type ReplicaRow = {
  article: string
  jour: string
  vcrtyp: string
  vcrnum: string
  net_doc: number
}

/** `T00:00:00Z` et NON heure locale : `StockFluxDocRow.jour` alimente
 *  `periodKey()`/`buildRefPeriods()` côté `stock_valuation_repository`, qui
 *  bucketent en UTC (même convention que `parseX3Date`, zone UTC forcée, côté
 *  X3 direct). Minuit LOCAL en UTC+1/+2 (France) vaut la veille en UTC —
 *  parser en heure locale ferait reculer chaque flux d'un jour, donc parfois
 *  d'un mois/une semaine ISO entière à la frontière d'une période. */
function toOwn(row: ReplicaRow): StockFluxDocRow {
  return {
    article: row.article,
    jour: new Date(`${row.jour}T00:00:00Z`),
    vcrtyp: row.vcrtyp,
    vcrnum: row.vcrnum,
    netDoc: row.net_doc,
  }
}

function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export class StockFluxReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  /** `articles` optionnel : borne la lecture aux articles demandés par l'appelant
   *  (mêmes bornes que `buildFluxSql` côté X3 direct) plutôt que rapatrier toute
   *  la fenêtre 12 mois en JS à chaque appel KPI. */
  async getFluxNetByDocument(
    from: Date,
    to: Date,
    articles?: string[]
  ): Promise<StockFluxDocRow[]> {
    let query = this.conn
      .from('stock_flux_replica')
      .where('jour', '>=', isoLocal(from))
      .andWhere('jour', '<=', isoLocal(to))
    if (articles && articles.length > 0) query = query.whereIn('article', articles)
    const rows = await query.select('*')
    return (rows as ReplicaRow[]).map(toOwn)
  }

  /** Borne basse réellement couverte par la table (question de DONNÉES, pas de
   *  fraîcheur — cf. commentaire de tête). `null` si la table est vide. */
  async getCoverage(): Promise<{ min: Date | null }> {
    const row = await this.conn.from('stock_flux_replica').min('jour as min_jour').first()
    const min = row?.min_jour ? new Date(`${row.min_jour}T00:00:00Z`) : null
    return { min }
  }

  /**
   * Âge du dernier run COMPLET réussi, en ms. `null` si jamais ingérée.
   *
   * Requête directe sur `ingestion_log` plutôt qu'un import de
   * `ReplicaSyncService.freshness()` : ce dernier importe déjà
   * `defaultStockRange` depuis `stock_valuation_repository.ts` (pour
   * `syncStockFlux`), et ce module-ci est importé PAR
   * `stock_valuation_repository.ts` — un import dans l'autre sens fermerait un
   * cycle. La requête est à peine plus qu'un alias de ce que `freshness()` fait
   * déjà pour une seule table.
   */
  async getLastFullRunAgeMs(): Promise<number | null> {
    const row = await this.conn
      .from('ingestion_log')
      .where('table_name', 'stock_flux_replica')
      .where('scope', 'full')
      .where('status', 'ok')
      .orderBy('id', 'desc')
      .select('finished_at')
      .first()
    if (!row?.finished_at) return null
    const finished = Date.parse(row.finished_at)
    if (Number.isNaN(finished)) return null
    return Date.now() - finished
  }
}

const stockFluxReplicaRepository = new StockFluxReplicaRepository()
export default stockFluxReplicaRepository
