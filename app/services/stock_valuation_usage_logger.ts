import db from '@adonisjs/lucid/services/db'

/**
 * Instrumentation temporaire (#98, lot 3 — scoping STOJOU, cf. commentaire GitHub
 * du 30/07/2026). Collecte `grain`/`pinned` des appels réels à `getStockValuation()`
 * pour trancher entre les options de réplication STOJOU sans deviner. À retirer
 * une fois la décision prise.
 *
 * Best-effort : une erreur d'écriture ne doit jamais faire échouer le KPI qui
 * l'appelle. Fire-and-forget côté appelant (pas de `await` sur le chemin chaud).
 */
export async function logStockValuationCall(
  grain: string,
  pinned: boolean,
  from: Date,
  to: Date
): Promise<void> {
  try {
    await db.table('stock_valuation_calls').insert({
      grain,
      pinned,
      from_date: from.toISOString().slice(0, 10),
      to_date: to.toISOString().slice(0, 10),
      called_at: new Date(),
    })
  } catch {
    // Best-effort — ne jamais remonter au chemin d'appel du KPI.
  }
}
