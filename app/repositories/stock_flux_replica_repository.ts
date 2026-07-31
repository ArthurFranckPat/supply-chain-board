import db from '@adonisjs/lucid/services/db'
import type { StockFluxDocRow } from '#repositories/stock_flux_repository'

/**
 * Lecture read-only de `stock_flux_replica` (#98, lot 3 — scoping du
 * 30/07/2026). Miroir de `StockFluxRepository.getFluxNetByDocument()` : même
 * grain (article, jour, document), même bornes [from, to] inclusives.
 *
 * Consommée par `stock_valuation_repository.getStockValuationKpi()` derrière
 * DEUX questions séparées, qui ne se remplacent pas :
 *  - TEMPS — le dernier run est-il assez récent ? `replicaGate`, seuil par
 *    table. Vaut pour toutes les répliques, pas seulement celle-ci.
 *  - DONNÉES — `getCoverage().min` : la réplique a-t-elle assez d'HISTOIRE pour
 *    le `from` demandé ? Propre à cette table, parce qu'elle seule est
 *    interrogée sur une plage arbitraire : une plage `pinned` plus ancienne que
 *    la fenêtre répliquée n'est couverte par aucun run, si récent soit-il.
 *
 * Ni l'une ni l'autre ne se déduit de `MAX(jour)` — essayé et rejeté. Sur un
 * site sans mouvement un jour donné (ou X3 test, dont l'activité STOJOU récente
 * est quasi nulle — mesuré le 30/07/2026), `MAX(jour)` reste en retard sur
 * « aujourd'hui » même juste après un run parfait : il ne distingue pas « pas
 * encore synchronisé » de « synchronisé, mais rien à synchroniser ce jour-là ».
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

  /**
   * Articles ayant eu AU MOINS UN mouvement depuis `from` — miroir du
   * sous-`SELECT ITMREF_0 FROM STOJOU WHERE IPTDAT_0 >= …` de `buildBaseSql`.
   *
   * Sert la seconde branche de la population du KPI valorisation : un article
   * vidé au cours de la plage a un stock nul aujourd'hui mais doit figurer dans
   * la série, sinon son historique disparaît au lieu de descendre à zéro.
   *
   * Le grain de la table est le DOCUMENT NET, pas la ligne `STOJOU` : un
   * document dont les mouvements se compensent (`net_doc = 0`) reste une ligne
   * ici, donc l'article reste détecté — même population que le sous-`SELECT`,
   * qui teste lui aussi la présence et non la quantité.
   */
  async getArticlesWithMovementSince(from: Date): Promise<Set<string>> {
    const rows = await this.conn
      .from('stock_flux_replica')
      .distinct('article')
      .where('jour', '>=', isoLocal(from))
    return new Set((rows as Array<{ article: string }>).map((r) => r.article))
  }

  /** Borne basse réellement couverte par la table (question de DONNÉES, pas de
   *  fraîcheur — cf. commentaire de tête). `null` si la table est vide. */
  async getCoverage(): Promise<{ min: Date | null }> {
    const row = await this.conn.from('stock_flux_replica').min('jour as min_jour').first()
    const min = row?.min_jour ? new Date(`${row.min_jour}T00:00:00Z`) : null
    return { min }
  }
}

const stockFluxReplicaRepository = new StockFluxReplicaRepository()
export default stockFluxReplicaRepository
