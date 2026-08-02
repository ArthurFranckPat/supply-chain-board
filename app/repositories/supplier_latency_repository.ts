/**
 * Repository de latence fournisseur — retard moyen observé par article (PRD §8.6).
 *
 * Source : PORDERQ (lignes de commande d'achat) où la date de réception prévue
 * (EXTRCPDAT_0) ET la date de réception réelle (LASRCPDAT_0) sont renseignées.
 *
 * Latence = date_réelle − date_prévue (en jours). Moyenne glissante par article
 * sur les 6 derniers mois de réceptions effectives. Plafonnée à [−30, +90] pour
 * filtrer les outliers (saisie tardive, erreurs de datation).
 *
 * Deux voies, une seule règle de calcul : `computeLatencyFromEvents` est pure et
 * partagée par la voie directe X3 et la voie réplique (`latency_replica`, #105).
 * La réplique mire les ÉVÉNEMENTS bruts (article, prévu, réel) — le plafonnement
 * et la moyenne se font à la LECTURE, comme le reste de la doctrine #105.
 */

import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/** Fenêtre arrière d'historique (jours). */
const LATENCY_LOOKBACK_DAYS = 180

/** Bornes de filtrage des outliers (jours). */
const MIN_LATENCY = -30
const MAX_LATENCY = 90

/** Une réception réelle : les deux dates que la latence compare. */
export interface LatencyEvent {
  article: string
  /** `EXTRCPDAT_0` — date de réception PRÉVUE. */
  prevu: Date
  /** `LASRCPDAT_0` — date de réception RÉELLE. */
  reel: Date
}

type RawRow = Record<string, string | null>

// ROWNUM s'applique AVANT le tri en Oracle : le tri doit être dans une
// sous-requête pour que la coupe à 5000 garde bien les réceptions les plus récentes.
const SQL = `
SELECT ART, PREVU, REEL FROM (
  SELECT ITMREF_0 AS ART, EXTRCPDAT_0 AS PREVU, LASRCPDAT_0 AS REEL
  FROM PORDERQ
  WHERE EXTRCPDAT_0 IS NOT NULL
    AND LASRCPDAT_0 IS NOT NULL
    AND LASRCPDAT_0 >= SYSDATE - ${LATENCY_LOOKBACK_DAYS}
    AND ITMREF_0 NOT LIKE 'YY-%'
  ORDER BY LASRCPDAT_0 DESC
)
WHERE ROWNUM <= 5000
`

/**
 * Voie X3 directe : les événements de réception (article, prévu, réel) bruts,
 * sans aucun calcul. Sert l'ingestion `latency_replica` ET le repli direct.
 */
export class X3LatencyRepository {
  async getLatencyEvents(): Promise<LatencyEvent[]> {
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(SQL)
      const events: LatencyEvent[] = []
      for (const row of rows) {
        const article = row.ART?.trim()
        if (!article) continue
        const prevu = parseX3Date(row.PREVU)
        const reel = parseX3Date(row.REEL)
        if (!prevu || !reel) continue
        events.push({ article, prevu, reel })
      }
      return events
    } finally {
      await db.destroy()
    }
  }
}

/**
 * Latence moyenne par article depuis des événements de réception — pure, partagée
 * par les deux voies. Positive = en retard, 0 = à l'heure, négative = en avance.
 */
export function computeLatencyFromEvents(events: LatencyEvent[]): Map<string, number> {
  // Accumulateur par article : somme des deltas + compte.
  const sumByArticle = new Map<string, number>()
  const countByArticle = new Map<string, number>()

  for (const e of events) {
    const delta = Math.round((e.reel.getTime() - e.prevu.getTime()) / 86_400_000)
    if (delta < MIN_LATENCY || delta > MAX_LATENCY) continue
    sumByArticle.set(e.article, (sumByArticle.get(e.article) ?? 0) + delta)
    countByArticle.set(e.article, (countByArticle.get(e.article) ?? 0) + 1)
  }

  const latency = new Map<string, number>()
  for (const [article, sum] of sumByArticle) {
    const count = countByArticle.get(article) ?? 1
    latency.set(article, Math.round(sum / count))
  }

  return latency
}

/**
 * Latence moyenne par article (en jours) — voie directe X3.
 * Retourne une Map<article, jours> — positive = en retard, 0 = à l'heure.
 */
export async function computeSupplierLatency(): Promise<Map<string, number>> {
  return computeLatencyFromEvents(await new X3LatencyRepository().getLatencyEvents())
}
