/**
 * Repository de latence fournisseur — retard moyen observé par article (PRD §8.6).
 *
 * Source : PORDERQ (lignes de commande d'achat) où la date de réception prévue
 * (EXTRCPDAT_0) ET la date de réception réelle (LASRCPDAT_0) sont renseignées.
 *
 * Latence = date_réelle − date_prévue (en jours). Moyenne glissante par article
 * sur les 6 derniers mois de réceptions effectives. Plafonnée à [−30, +90] pour
 * filtrer les outliers (saisie tardive, erreurs de datation).
 */

import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/** Fenêtre arrière d'historique (jours). */
const LATENCY_LOOKBACK_DAYS = 180

/** Bornes de filtrage des outliers (jours). */
const MIN_LATENCY = -30
const MAX_LATENCY = 90

const SQL = `
SELECT ITMREF_0 AS ART, EXTRCPDAT_0 AS PREVU, LASRCPDAT_0 AS REEL
FROM PORDERQ
WHERE EXTRCPDAT_0 IS NOT NULL
  AND LASRCPDAT_0 IS NOT NULL
  AND LASRCPDAT_0 >= SYSDATE - ${LATENCY_LOOKBACK_DAYS}
  AND ITMREF_0 NOT LIKE 'YY-%'
  AND ROWNUM <= 5000
`

type RawRow = Record<string, string | null>

/**
 * Calcule la latence moyenne par article (en jours) depuis l'historique des réceptions.
 * Retourne une Map<article, jours> — positive = en retard, 0 = à l'heure.
 */
export async function computeSupplierLatency(): Promise<Map<string, number>> {
  const db = new X3Database()
  try {
    const rows: RawRow[] = await db.raw(SQL)

    // Accumulateur par article : somme des deltas + compte.
    const sumByArticle = new Map<string, number>()
    const countByArticle = new Map<string, number>()

    for (const row of rows) {
      const article = row.ART?.trim()
      if (!article) continue

      const prevu = parseX3Date(row.PREVU)
      const reel = parseX3Date(row.REEL)
      if (!prevu || !reel) continue

      const delta = Math.round((reel.getTime() - prevu.getTime()) / 86_400_000)
      if (delta < MIN_LATENCY || delta > MAX_LATENCY) continue

      sumByArticle.set(article, (sumByArticle.get(article) ?? 0) + delta)
      countByArticle.set(article, (countByArticle.get(article) ?? 0) + 1)
    }

    const latency = new Map<string, number>()
    for (const [article, sum] of sumByArticle) {
      const count = countByArticle.get(article) ?? 1
      latency.set(article, Math.round(sum / count))
    }

    return latency
  } finally {
    await db.destroy()
  }
}
