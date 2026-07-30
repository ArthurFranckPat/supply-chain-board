import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Flux STOJOU net par DOCUMENT (#98, lot 3). Extrait le stade intermédiaire de
 * `buildFluxSql` (stock_valuation_repository.ts) — net par (article, jour,
 * document), AVANT la deuxième agrégation par période. C'est ce stade qui
 * neutralise les contrepassations/reclassements documentés dans le commentaire
 * de `buildFluxSql` ; la réplique le fige à l'ingestion, la deuxième agrégation
 * (mois OU semaine) reste possible à la lecture, sur SQLite.
 *
 * Chunké par bloc de `CHUNK_DAYS` jours (pas par article comme `buildFluxSql`) :
 * cette extraction n'est bornée à aucune liste d'articles — c'est la réplique
 * complète du site, pas le flux d'un seul appel KPI. Le motif du chunk reste le
 * même : le pull complet dépasse le seuil de lignes du web service SOAP
 * Syracuse (`resultXml` nil).
 *
 * Seuil mesuré en direct contre PROD le 30/07/2026 (même requête, hors app) :
 * une semaine pleine (~11-15k lignes) passe, deux semaines (~20k+) échouent en
 * `resultXml is nil`. `CHUNK_DAYS = 3` (~5-6k lignes/chunk) garde une marge
 * réelle sous ce seuil plutôt que de coller dessus — un pic d'activité
 * (rattrapage fin de mois, inventaire) ne doit pas faire échouer un chunk.
 */

const SITE = 'AE1'

type RawRow = Record<string, string | null>

export interface StockFluxDocRow {
  article: string
  jour: Date
  vcrtyp: string
  vcrnum: string
  netDoc: number
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

/** Borne haute EXCLUSIVE (`<`), comme le reste du codage X3 sur ce repo (cf.
 *  `buildMatchingDeltaSql`). Évite de recompter le jour pivot entre deux chunks. */
const buildDocFluxSql = (fromStr: string, toExclusiveStr: string) => `
SELECT
  ITMREF_0    AS ARTICLE,
  TRUNC(IPTDAT_0) AS JOUR,
  VCRTYP_0    AS VCRTYP,
  VCRNUM_0    AS VCRNUM,
  SUM(QTYSTU_0) AS NETQ
FROM STOJOU
WHERE STOFCY_0 = '${SITE}'
  AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD')
  AND IPTDAT_0 < TO_DATE('${toExclusiveStr}','YYYYMMDD')
GROUP BY ITMREF_0, TRUNC(IPTDAT_0), VCRTYP_0, VCRNUM_0
`

const CHUNK_DAYS = 3

export class StockFluxRepository {
  /** [from, to] inclusif des deux côtés — `to` est un jour, pas un instant. */
  async getFluxNetByDocument(from: Date, to: Date): Promise<StockFluxDocRow[]> {
    const toExclusive = addDays(to, 1)
    const out: StockFluxDocRow[] = []

    const db = new X3Database()
    try {
      let chunkStart = from
      while (chunkStart < toExclusive) {
        const chunkEnd = new Date(
          Math.min(addDays(chunkStart, CHUNK_DAYS).getTime(), toExclusive.getTime())
        )
        const rows: RawRow[] = await db.raw(
          buildDocFluxSql(toYYYYMMDD(chunkStart), toYYYYMMDD(chunkEnd))
        )
        for (const r of rows) {
          const jour = parseX3Date(r.JOUR)
          if (!jour) continue
          out.push({
            article: r.ARTICLE?.trim() ?? '',
            jour,
            vcrtyp: r.VCRTYP?.trim() ?? '',
            vcrnum: r.VCRNUM?.trim() ?? '',
            netDoc: Number.parseFloat(r.NETQ ?? '0') || 0,
          })
        }
        chunkStart = chunkEnd
      }
    } finally {
      await db.destroy()
    }
    return out
  }
}
