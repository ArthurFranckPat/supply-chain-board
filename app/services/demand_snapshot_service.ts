import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import boardDataset from '#services/board_dataset'
import { ApproRepository } from '#app/repositories/appro_repository'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { isoDay } from '#app/utils/dates'
import {
  diffApproSnapshots,
  type ApproDiffNature,
  type ApproSnapshotRow,
} from '#app/domain/appro_snapshot_diff'

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
   * Jour de la photo la plus récente (`YYYY-MM-DD`), `null` si la table est vide.
   *
   * C'est le seul état durable dont dispose la planification quotidienne
   * (`demand_snapshot_provider.ts`) : ce service n'écrit pas d'`ingestion_log`,
   * volontairement (cf. `write()`). La photo elle-même fait donc office de
   * journal — ce qui suffit, puisque la question posée est exactement « la photo
   * du jour existe-t-elle ». Lu en base et non gardé en mémoire, pour la même
   * raison que `ReplicaSyncService.lastFullRuns()` : un redémarrage ne doit pas
   * pouvoir faire sauter une journée en silence.
   *
   * SQLite stocke `snapshot_date` en texte ISO de largeur fixe : `MAX()` y est
   * bien l'ordre chronologique.
   */
  async latestSnapshotDay(): Promise<string | null> {
    const row = await db.connection().from('demand_snapshots').max('snapshot_date as day').first()
    const day: unknown = (row as { day?: unknown } | null)?.day ?? null
    if (day === null || day === undefined) return null
    // Selon le driver, une colonne `date` peut revenir en `Date` plutôt qu'en
    // texte. Normaliser ici évite une comparaison de types au point d'appel.
    if (day instanceof Date) return isoDay(day)
    return String(day).slice(0, 10)
  }

  /**
   * Lignes de la photo des suggestions d'un jour donné (source `appro_suggestion`).
   * `null` si aucune photo ce jour-là (le jour est l'identité de la photo).
   */
  async approSnapshots(dateStr: string): Promise<ApproSnapshotRow[] | null> {
    const rows = await db
      .connection()
      .from('demand_snapshots')
      .where('snapshot_date', dateStr)
      .andWhere('source', 'appro_suggestion')
    if (rows.length === 0) return null
    return rows.map((r) => ({
      article: String(r.itmref),
      fournisseur: r.fournisseur === null ? null : String(r.fournisseur),
      quantite: Number(r.quantity),
      echeance: r.date_echeance === null ? null : String(r.date_echeance),
    }))
  }

  /**
   * Les deux jours de photo des suggestions les plus récents, `[apres, avant]`.
   * `null` s'il n'y en a pas deux — un diff a besoin de deux points.
   *
   * Lus en base plutôt que déduits de la date du jour : un run nocturne manqué,
   * un week-end ou un lundi matin ne doivent pas rendre le diff indisponible
   * alors que deux photos comparables existent. Les deux jours rendus peuvent
   * donc être distants de plus d'un jour — l'écran affiche les dates.
   */
  async deuxDernieresPhotosAppro(): Promise<[string, string] | null> {
    const rows = await db
      .connection()
      .from('demand_snapshots')
      .where('source', 'appro_suggestion')
      .distinct('snapshot_date')
      .orderBy('snapshot_date', 'desc')
      .limit(2)
    if (rows.length < 2) return null
    const jour = (r: unknown): string => {
      const v = (r as { snapshot_date?: unknown }).snapshot_date
      return v instanceof Date ? isoDay(v) : String(v).slice(0, 10)
    }
    return [jour(rows[0]), jour(rows[1])]
  }

  /**
   * Diff inter-CBN des suggestions entre deux photos (#133) : apparues,
   * disparues, quantités > ±20 % et échéances > ±7 j (#112). Une photo
   * manquante d'un côté rend le diff indisponible (`null`) — pas de faux
   * « tout est apparu » sur un trou de données.
   */
  async diffAppro(apresDay: string, avantDay: string) {
    const [avant, apres] = await Promise.all([
      this.approSnapshots(avantDay),
      this.approSnapshots(apresDay),
    ])
    if (avant === null || apres === null) return null
    const entrees = diffApproSnapshots(avant, apres)
    const parNature: Record<ApproDiffNature, number> = {
      apparue: 0,
      disparue: 0,
      quantite: 0,
      date: 0,
    }
    for (const e of entrees) parNature[e.nature] += 1
    return { avant: avantDay, apres: apresDay, parNature, entrees }
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

    // Suggestions d'achat CBN (WIPTYP=2, WIPSTA=3) — #133. Population COMPLÈTE
    // (horizon 18 mois, ~5 600 lignes mesurées #108) : c'est elle qui permet de
    // voir une suggestion APPARAÎTRE avant son horizon utile. `VCRNUM` recréé
    // chaque run → la clé du diff est le contenu (appro_snapshot_diff.ts).
    //
    // Source ISOLÉE : une erreur X3 ici ne doit pas faire perdre la photo des
    // autres populations (X3 ne versionne rien — une photo manquée est manquée).
    // Au pire, une photo sans suggestions → le diff répond « indisponible ».
    try {
      const appro = await new ApproRepository().fetch(approSnapshotTo())
      for (const s of appro.suggestions) {
        out.push({
          snapshot_date: dateStr,
          source: 'appro_suggestion',
          itmref: s.article,
          vcrnum: s.numero,
          vcrlin: null,
          quantity: s.quantite,
          date_echeance: isoDayOrNull(s.date),
          fournisseur: s.fournisseur,
        })
      }
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        '[snapshot] suggestions CBN indisponibles — source écartée de la photo du jour'
      )
    }

    return out
  }
}

/** Borne de la photo des suggestions : horizon 18 mois (#108, population complète). */
const APPRO_SNAPSHOT_HORIZON_DAYS = 548
const approSnapshotTo = (): string => {
  const d = new Date(Date.now() + APPRO_SNAPSHOT_HORIZON_DAYS * 86_400_000)
  return d.toISOString().slice(0, 10)
}

const demandSnapshotService = new DemandSnapshotService()
export default demandSnapshotService
