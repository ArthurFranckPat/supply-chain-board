import db from '@adonisjs/lucid/services/db'
import { computeLatencyFromEvents } from '#repositories/supplier_latency_repository'
import type { LatencyEvent } from '#repositories/supplier_latency_repository'

/**
 * Lecture read-only de `latency_replica` (#105) — miroir des événements de
 * réception PORDERQ (article, prévu, réel) qui alimentent la latence fournisseur.
 *
 * Aucun calcul ici : la moyenne par article est déduite à la LECTURE via
 * `computeLatencyFromEvents`, partagée avec la voie directe — une seule règle,
 * un seul endroit. Ne décide RIEN sur la confiance : passer par
 * `replicaGate.canRead('latency_replica')` en amont, comme les autres répliques.
 */

type ReplicaRow = {
  article: string
  date_prevue: string
  date_reelle: string
}

/** `YYYY-MM-DD` local — même format que l'ingestion (`isoDay`). */
function parseLocal(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export class LatencyReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  /** Les événements bruts ingérés — sans filtre ni agrégation. */
  async getLatencyEvents(): Promise<LatencyEvent[]> {
    const rows = await this.conn.from('latency_replica').select('*')
    const events: LatencyEvent[] = []
    for (const r of rows as ReplicaRow[]) {
      const prevu = parseLocal(r.date_prevue)
      const reel = parseLocal(r.date_reelle)
      // Même discipline que `X3LatencyRepository` : un événement dont une date
      // est illisible n'existe pas pour le calcul, il ne le fausse pas.
      if (!prevu || !reel) continue
      events.push({ article: r.article, prevu, reel })
    }
    return events
  }
}

const latencyReplicaRepository = new LatencyReplicaRepository()
export default latencyReplicaRepository

/**
 * Latence moyenne par article depuis la réplique — le pendant réplique de
 * `computeSupplierLatency`. Le calcul est le MÊME, seule la source change.
 */
export async function latencyMapFromReplica(): Promise<Map<string, number>> {
  return computeLatencyFromEvents(await latencyReplicaRepository.getLatencyEvents())
}
