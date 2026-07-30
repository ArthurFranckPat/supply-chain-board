import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { isoDay } from '#app/utils/dates'

/**
 * Photo quotidienne du besoin (#74 lot 1, absorbé par #98 lot 4).
 *
 * X3 ne versionne rien côté prévisions — cf. commentaire de la migration
 * `demand_snapshots`. Ce service capture 4 populations à un instant T, via les
 * repositories déjà en place (`board_dataset` pour OF/lignes de commande —
 * caches SWR existants, cf. #98 lots 1-2 — puis X3 direct pour stock/appros,
 * qui n'ont pas d'équivalent caché sans filtre d'article) :
 *
 *  - `of_ferme` / `of_planifie` / `of_suggestion` — `boardDataset.getOrders()`
 *  - `demande_ferme` / `demande_prevision` — `X3OrderLineRepository` (lignes
 *    ouvertes, sans fenêtre — une photo doit capter TOUTE la demande visible,
 *    pas seulement un horizon)
 *  - `stock` — `X3StockRepository.getStockLevels()`, quantité = stock STRICT
 *    (physique − alloué phys − alloué global), même convention que les
 *    moteurs de faisabilité
 *  - `appro` — `X3ReceptionRepository.getReceptionFlows()` (PORDERQ ouvertes)
 *
 * Swap complet PAR DATE (delete + insert transactionnel), même motif que
 * `ReplicaSyncService.ingest()` : idempotent — rejouer `run()` pour la même
 * date remplace la photo au lieu de la dupliquer.
 *
 * Garde-fou explicite (critère d'acceptation #74) : une extraction VIDE
 * n'écrase jamais une photo existante. Une extraction vide signale presque
 * toujours une panne X3 partielle, pas un état réel — remplacer une bonne
 * photo par du vide serait pire que ne rien faire.
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

const INSERT_CHUNK = 400

function isoDayOrNull(d: Date | null | undefined): string | null {
  return d ? isoDay(d) : null
}

export interface SnapshotResult {
  date: string
  status: 'ok' | 'failed' | 'skipped-empty'
  rows: number
  durationMs: number
  error?: string
}

export class DemandSnapshotService {
  async run(date: Date = new Date(), source = 'manual'): Promise<SnapshotResult> {
    const dateStr = isoDay(date)
    return this.write(dateStr, source, () => this.buildRows(dateStr))
  }

  /**
   * Swap complet + garde-fou, isolé de l'extraction X3 — même découpage que
   * `ReplicaSyncService.ingest(table, source, fetch)`, `protected` pour la même
   * raison : seule cette logique (transaction, garde-fou vide, journalisation)
   * est testable sans X3 joignable. `tests/unit/demand_snapshot_service.test.ts`
   * la rejoue via une sous-classe qui expose cette méthode.
   */
  protected async write(
    dateStr: string,
    source: string,
    fetchRows: () => Promise<DemandSnapshotRow[]>
  ): Promise<SnapshotResult> {
    const start = Date.now()

    try {
      const rows = await fetchRows()

      if (rows.length === 0) {
        logger.warn(
          { date: dateStr, source },
          '[snapshot] extraction vide — écriture annulée, photo existante préservée'
        )
        return {
          date: dateStr,
          status: 'skipped-empty',
          rows: 0,
          durationMs: Date.now() - start,
          error: 'extraction vide — écriture annulée, photo existante (si any) préservée',
        }
      }

      const conn = db.connection()
      const trx = await conn.transaction()
      try {
        await trx.from('demand_snapshots').where('snapshot_date', dateStr).delete()
        for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
          await trx
            .table('demand_snapshots')
            .insert(rows.slice(i, i + INSERT_CHUNK).map((r) => ({ ...r, created_at: new Date() })))
        }
        await trx.commit()
      } catch (error) {
        await trx.rollback()
        throw error
      }

      const durationMs = Date.now() - start
      // `source` ('manual' | 'scheduler' | 'cli') sert d'observabilité minimale
      // (critère d'acceptation) : à défaut d'un journal dédié, un log applicatif
      // suffit pour ce lot — un `ingestion_log`-like viendrait avec le lot 2 s'il
      // s'avère nécessaire (verdicts UI, historique des runs).
      logger.info(
        { date: dateStr, source, rows: rows.length, durationMs },
        `[snapshot] ${dateStr} : ${rows.length} lignes en ${durationMs} ms`
      )
      return { date: dateStr, status: 'ok', rows: rows.length, durationMs }
    } catch (error) {
      const message = (error as Error)?.message ?? String(error)
      const durationMs = Date.now() - start
      logger.error({ date: dateStr, source, err: message }, `[snapshot] échec ${dateStr}`)
      return { date: dateStr, status: 'failed', rows: 0, durationMs, error: message }
    }
  }

  private async buildRows(dateStr: string): Promise<DemandSnapshotRow[]> {
    const out: DemandSnapshotRow[] = []

    const { mos } = await boardDataset.getOrders()
    for (const mo of mos) {
      const src = mo.status === 1 ? 'of_ferme' : mo.status === 2 ? 'of_planifie' : 'of_suggestion'
      out.push({
        snapshot_date: dateStr,
        source: src,
        itmref: mo.article,
        vcrnum: mo.numOf,
        vcrlin: null,
        quantity: mo.quantity,
        date_echeance: isoDayOrNull(mo.endDate),
        fournisseur: null,
      })
    }

    const lines = await new X3OrderLineRepository().getOpenOrderLines()
    for (const l of lines) {
      out.push({
        snapshot_date: dateStr,
        source: l.nature === 'COMMANDE' ? 'demande_ferme' : 'demande_prevision',
        itmref: l.article,
        vcrnum: l.numCommande,
        vcrlin: l.ligne,
        quantity: l.quantite,
        date_echeance: isoDayOrNull(l.dateLivraison),
        fournisseur: null,
      })
    }

    const stock = await new X3StockRepository().getStockLevels()
    for (const s of stock) {
      out.push({
        snapshot_date: dateStr,
        source: 'stock',
        itmref: s.article,
        vcrnum: null,
        vcrlin: null,
        quantity: s.physique - s.allouePhys - s.alloueGlobal,
        date_echeance: null,
        fournisseur: null,
      })
    }

    const receptions = await new X3ReceptionRepository().getReceptionFlows()
    for (const f of receptions) {
      if (f.origin.type !== 'reception') continue
      out.push({
        snapshot_date: dateStr,
        source: 'appro',
        itmref: f.article,
        vcrnum: f.origin.id,
        vcrlin: null,
        quantity: f.quantity,
        date_echeance: isoDayOrNull(f.date),
        fournisseur: f.origin.supplier,
      })
    }

    return out
  }
}

const demandSnapshotService = new DemandSnapshotService()
export default demandSnapshotService
