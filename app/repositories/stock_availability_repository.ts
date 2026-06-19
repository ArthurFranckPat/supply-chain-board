import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * Disponibilité réelle d'un composant (analyse rétrospective des retards de prod).
 *
 * `dispoA`  : dernière date à laquelle du stock du composant est devenu DISPONIBLE (statut A),
 *             en couvrant la réception directe en A (VCRTYP=6) ET la libération contrôle qualité
 *             Q→A (VCRTYP=28). C'est la vraie date de mise à disposition pour la production.
 * `rawReception` : dernière réception ACHAT brute (VCRTYP=6), tous statuts confondus. Sert à
 *             détecter le passage par le contrôle qualité : si `dispoA` > `rawReception`, la
 *             pièce a séjourné en statut Q avant d'être libérée (info affichée à l'utilisateur).
 *
 * `STOJOU.ACCDAT_0` est un sentinel (`31-DEC-99`) inexploitable → on utilise `CREMVTDAT_0`
 * (date de mouvement). `QTYSTU_0 > 0` = entrées uniquement (les sorties sont négatives).
 */
export interface ComponentAvailability {
  dispoA: Date | null
  rawReception: Date | null
}

const AVAIL_SQL = `
SELECT
  ITMREF_0 AS ART,
  MAX(CASE WHEN STA_0 = 'A' THEN CREMVTDAT_0 END) AS DISPO_A,
  MAX(CASE WHEN VCRTYP_0 = '6' THEN CREMVTDAT_0 END) AS RAW_REC
FROM STOJOU
WHERE QTYSTU_0 > 0
  AND VCRTYP_0 IN ('6', '28')
  AND ITMREF_0 IN (__IN__)
GROUP BY ITMREF_0
`

type RawRow = Record<string, string | null>

export class X3StockAvailabilityRepository {
  /**
   * Pour une liste d'articles composants, renvoie la dernière date de disponibilité (statut A)
   * et la dernière réception achat brute. Batch (chunk IN 1000) — l'agrégat STOJOU est rapide.
   */
  async getAvailabilityByArticle(articles: string[]): Promise<Map<string, ComponentAvailability>> {
    const unique = [...new Set(articles.map((a) => a.trim()).filter(Boolean))]
    const out = new Map<string, ComponentAvailability>()
    if (unique.length === 0) return out

    const db = new X3Database()
    try {
      for (let i = 0; i < unique.length; i += 1000) {
        const chunk = unique.slice(i, i + 1000)
        const inList = chunk.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')
        const rows: RawRow[] = await db.raw(AVAIL_SQL.replace('__IN__', inList))
        for (const row of rows) {
          const art = row.ART?.trim()
          if (!art) continue
          out.set(art, {
            dispoA: parseX3Date(row.DISPO_A),
            rawReception: parseX3Date(row.RAW_REC),
          })
        }
      }
      return out
    } finally {
      await db.destroy()
    }
  }
}
