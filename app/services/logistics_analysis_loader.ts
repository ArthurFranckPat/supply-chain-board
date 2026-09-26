import { DateTime } from 'luxon'
import { X3Database } from '#app/x3/client/x3_database'
import { StockValuationRepository } from '#repositories/stock_valuation_repository'
import {
  assembleLogisticsRows,
  type LogisticsBase,
  type LogisticsFuture,
  type LogisticsHistory,
  type LogisticsRow,
} from '#app/domain/logistics_analysis'

const SITE = 'AE1'
const CHUNK_SIZE = 120
const FUTURE_PAGE_SIZE = 150
type RawRow = Record<string, string | null>

const number = (value: string | null | undefined): number => {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : 0
}
const optionalNumber = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
const quote = (value: string): string => "'" + value.replace(/'/g, "''") + "'"

export interface LogisticsAnalysis {
  rows: LogisticsRow[]
  site: string
  from: string
  to: string
  calendarDays: number
}

/**
 * ZPERFSC2 corrigée : les paramètres et le PMP sont lus sur AE1. On ne part
 * que des articles ayant du stock, un mouvement récent ou un besoin futur :
 * la valorisation fournit les deux premiers, ORDERS le troisième.
 */
async function loadBases(db: X3Database, articles: string[]): Promise<LogisticsBase[]> {
  const bases = new Map<string, LogisticsBase>()
  for (let index = 0; index < articles.length; index += CHUNK_SIZE) {
    const chunk = articles.slice(index, index + CHUNK_SIZE)
    const rows: RawRow[] = await db.raw(`
SELECT
  M.ITMREF_0 AS ARTICLE, M.ITMDES1_0 AS DESIGNATION,
  M.TCLCOD_0 AS CATEGORIE, M.YFAMSTAT7_0 AS FAMILLE,
  V.PHYSTO_0 AS STOCK_A, V.CTLSTO_0 AS STOCK_Q,
  V.PHYALL_0 + V.GLOALL_0 AS STOCK_ALLOUE, V.AVC_0 AS PMP,
  F.SAFSTO_0 AS STOCK_SECURITE, F.OFS_0 AS DELAI,
  F.MFGLOTQTY_0 AS LOT_TECHNIQUE, F.REOMINQTY_0 AS LOT_ECONOMIQUE,
  P.BPSNUM_0 AS FOURNISSEUR_CODE, S.BPSNAM_0 AS FOURNISSEUR_NOM
FROM ITMMASTER M
JOIN ITMMVT V ON V.ITMREF_0 = M.ITMREF_0 AND V.STOFCY_0 = '${SITE}'
LEFT JOIN ITMFACILIT F ON F.ITMREF_0 = M.ITMREF_0 AND F.STOFCY_0 = '${SITE}'
LEFT JOIN ITMBPS P ON P.ITMREF_0 = M.ITMREF_0 AND P.DEFBPSFLG_0 = 2
LEFT JOIN BPSUPPLIER S ON S.BPSNUM_0 = P.BPSNUM_0
WHERE M.ITMREF_0 IN (${chunk.map(quote).join(',')})
  AND M.ITMSTA_0 = 1
  AND M.TCLCOD_0 NOT LIKE 'Z%'
  AND V.AVC_0 > 0
ORDER BY M.ITMREF_0, P.BPSNUM_0
`)
    for (const row of rows) {
      const article = row.ARTICLE?.trim() ?? ''
      if (!article || bases.has(article)) continue
      bases.set(article, {
        article,
        designation: row.DESIGNATION?.trim() ?? '',
        categorie: row.CATEGORIE?.trim() ?? '',
        famille: row.FAMILLE?.trim() || null,
        fournisseurCode: row.FOURNISSEUR_CODE?.trim() || null,
        fournisseurNom: row.FOURNISSEUR_NOM?.trim() || null,
        delaiReapproJours: optionalNumber(row.DELAI),
        lotTechnique: optionalNumber(row.LOT_TECHNIQUE),
        lotEconomique: optionalNumber(row.LOT_ECONOMIQUE),
        stockSecurite: optionalNumber(row.STOCK_SECURITE),
        stockA: number(row.STOCK_A),
        stockQ: number(row.STOCK_Q),
        stockAlloue: number(row.STOCK_ALLOUE),
        pmp: number(row.PMP),
      })
    }
  }
  return [...bases.values()]
}

/**
 * Besoins ouverts sur 12 mois, retards inclus. ENDDAT pour commandes client,
 * STRDAT pour besoins matières (convention ZPERFSC2). Le keyset évite la limite
 * de taille du resultXml SOAP sans couper arbitrairement le jeu de résultats.
 */
async function loadFuture(db: X3Database, today: string): Promise<Map<string, LogisticsFuture>> {
  const future = new Map<string, LogisticsFuture>()
  let cursor = ''
  for (;;) {
    const rows: RawRow[] = await db.raw(`
SELECT ARTICLE, BESOIN, RETARD
FROM (
  SELECT ITMREF_0 AS ARTICLE,
    SUM(RMNEXTQTY_0) AS BESOIN,
    SUM(CASE WHEN (CASE WHEN WIPTYP_0 = 1 THEN ENDDAT_0 ELSE STRDAT_0 END)
      < TO_DATE('${today}', 'YYYYMMDD') THEN RMNEXTQTY_0 ELSE 0 END) AS RETARD
  FROM ORDERS
  WHERE STOFCY_0 = '${SITE}'
    AND WIPTYP_0 IN (1, 6)
    AND WIPSTA_0 IN (1, 2, 3)
    AND RMNEXTQTY_0 > 0
    ${cursor ? `AND ITMREF_0 > ${quote(cursor)}` : ''}
    AND (CASE WHEN WIPTYP_0 = 1 THEN ENDDAT_0 ELSE STRDAT_0 END)
      < ADD_MONTHS(TO_DATE('${today}', 'YYYYMMDD'), 12)
  GROUP BY ITMREF_0
  ORDER BY ITMREF_0
)
WHERE ROWNUM <= ${FUTURE_PAGE_SIZE}
`)
    for (const row of rows) {
      const article = row.ARTICLE?.trim() ?? ''
      if (article) future.set(article, { besoin: number(row.BESOIN), enRetard: number(row.RETARD) })
    }
    if (rows.length < FUTURE_PAGE_SIZE) break
    const next = rows[rows.length - 1]?.ARTICLE?.trim() ?? ''
    if (!next || next <= cursor) throw new Error('Pagination ORDERS bloquée')
    cursor = next
  }
  return future
}

/**
 * Les sorties sont nettées par document : STOJOU contient des contrepassations
 * et des lignes ± qui ne sont pas de la consommation physique. Une opération
 * est un document net sortant, distinct d'une ligne de journal.
 */
async function loadHistory(
  db: X3Database,
  bases: LogisticsBase[],
  from: string,
  today: string
): Promise<Map<string, LogisticsHistory>> {
  const history = new Map<string, LogisticsHistory>()
  for (let index = 0; index < bases.length; index += CHUNK_SIZE) {
    const chunk = bases.slice(index, index + CHUNK_SIZE)
    const rows: RawRow[] = await db.raw(`
SELECT ARTICLE,
  SUM(CASE WHEN NET_DOC < 0 THEN -NET_DOC ELSE 0 END) AS CONSOMMATION,
  COUNT(DISTINCT CASE WHEN NET_DOC < 0 THEN JOUR ELSE NULL END) AS JOURS,
  SUM(CASE WHEN NET_DOC < 0 THEN 1 ELSE 0 END) AS OPERATIONS
FROM (
  SELECT J.ITMREF_0 AS ARTICLE, TRUNC(J.IPTDAT_0) AS JOUR,
    J.VCRTYP_0, J.VCRNUM_0, J.TRSTYP_0,
    SUM(J.QTYSTU_0) AS NET_DOC
  FROM STOJOU J
  JOIN ITMMASTER M ON M.ITMREF_0 = J.ITMREF_0
  WHERE J.STOFCY_0 = '${SITE}'
    AND J.IPTDAT_0 >= TO_DATE('${from}', 'YYYYMMDD')
    AND J.IPTDAT_0 < TO_DATE('${today}', 'YYYYMMDD') + 1
    AND J.ITMREF_0 IN (${chunk.map((base) => quote(base.article)).join(',')})
    AND ((J.TRSTYP_0 = 4
      AND (M.TCLCOD_0 LIKE 'PF%' OR M.TCLCOD_0 IN ('ACV', 'APV', 'SFV')))
      OR J.TRSTYP_0 = 6)
  GROUP BY J.ITMREF_0, TRUNC(J.IPTDAT_0), J.VCRTYP_0, J.VCRNUM_0, J.TRSTYP_0
)
GROUP BY ARTICLE
`)
    for (const row of rows) {
      const article = row.ARTICLE?.trim() ?? ''
      if (article) {
        history.set(article, {
          consommation: number(row.CONSOMMATION),
          joursMouvement: number(row.JOURS),
          operations: number(row.OPERATIONS),
        })
      }
    }
  }
  return history
}

export async function loadLogisticsAnalysis(
  reference: Date = new Date()
): Promise<LogisticsAnalysis> {
  const now = DateTime.fromJSDate(reference).setZone('Europe/Paris').startOf('day')
  const first = now.minus({ months: 11 }).startOf('month')
  const from = first.toFormat('yyyyLLdd')
  const today = now.toFormat('yyyyLLdd')
  // Le repository stock travaille en dates UTC : passer les jours civils de
  // Paris explicitement, sinon minuit Paris tombe la veille en UTC.
  const utcDay = (day: DateTime) => new Date(Date.UTC(day.year, day.month - 1, day.day))
  const db = new X3Database()
  try {
    const valuation = await new StockValuationRepository().getStockValuationKpi(
      utcDay(now),
      'mois',
      utcDay(first),
      utcDay(now)
    )
    const future = await loadFuture(db, today)
    const articleKeys = [
      ...new Set([...valuation.articles.map((row) => row.article), ...future.keys()]),
    ]
    const bases = await loadBases(db, articleKeys)
    const history = await loadHistory(db, bases, from, today)
    const stockMeans = new Map(valuation.articles.map((row) => [row.article, row.stockMoyen]))
    const calendarDays = Math.floor(now.diff(first, 'days').days) + 1
    return {
      rows: assembleLogisticsRows(bases, history, future, stockMeans, calendarDays),
      site: SITE,
      from: first.toISODate() ?? '',
      to: now.toISODate() ?? '',
      calendarDays,
    }
  } finally {
    await db.destroy()
  }
}
