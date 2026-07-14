import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'

/**
 * KPI Valorisation du stock — reconstruction sur une plage (site AE1).
 *
 * MÉTHODE : rembobinage en QUANTITÉ, valorisation au PMP actuel.
 *
 * Le pont SOAP Syracuse refuse les CTE (WITH) ; on rembobine donc côté TS
 * (même motif que retard_repository). On part du stock actuel et on défaite
 * les mouvements nets des périodes postérieures pour retrouver le stock de
 * fin de chaque période :
 *   QTE_CLOSE(P) = STK_NOW − Σ QTYSTU(périodes postérieures à P)
 * La valorisation applique ensuite le PMP actuel à chaque période :
 *   VAL_CLOSE(P) = QTE_CLOSE(P) × PMP_NOW
 *
 * La maille (grain) est paramétrique : 'mois' (TRUNC 'MM') ou 'semaine'
 * (TRUNC 'IW', semaine ISO). La plage [from, to] délimite les périodes
 * affichées ; le flux est fetché de `from` à aujourd'hui pour que le
 * rembobinage reste ancré sur le stock actuel (snapshot ITMMVT).
 */

const SITE = 'AE1'

export type StockGrain = 'mois' | 'semaine'

type RawRow = Record<string, string | null>

/** Base articles : stock + PMP actuels sur AE1.
 *  Population = stock non nul OU article ayant eu des mouvements sur la fenêtre
 *  (évite les faux zéros pour les articles vidés au cours de la plage). */
const buildBaseSql = (fromStr: string) => `
SELECT
  M.ITMREF_0    AS ARTICLE,
  M.ITMDES1_0   AS DESIGNATION,
  M.TCLCOD_0    AS CATEGORIE,
  (V.PHYSTO_0 + V.CTLSTO_0) AS STK,
  V.AVC_0       AS PMP
FROM ITMMASTER M
INNER JOIN ITMMVT V ON V.ITMREF_0 = M.ITMREF_0 AND V.STOFCY_0 = '${SITE}'
WHERE M.ITMSTA_0 = 1
  AND M.TCLCOD_0 NOT LIKE 'Z%'
  AND ((V.PHYSTO_0 + V.CTLSTO_0) <> 0
       OR M.ITMREF_0 IN (SELECT ITMREF_0 FROM STOJOU
                         WHERE STOFCY_0 = '${SITE}'
                           AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD')))
`

/** Flux agrégé par article × période (entrées, sorties, net qté).
 *  Filtré par liste d'articles (chunk) — le flux complet dépasse le seuil de
 *  lignes du web service SOAP Syracuse (resultXml is nil). */
const buildFluxSql = (fromStr: string, articles: string[], grain: StockGrain) => `
SELECT
  ITMREF_0 AS ARTICLE,
  TRUNC(IPTDAT_0,${grain === 'semaine' ? "'IW'" : "'MM'"}) AS PERIODE,
  SUM(CASE WHEN QTYSTU_0 > 0 THEN QTYSTU_0 ELSE 0 END) AS ENTREE,
  SUM(CASE WHEN QTYSTU_0 < 0 THEN ABS(QTYSTU_0) ELSE 0 END) AS SORTIE,
  SUM(QTYSTU_0) AS NETQ
FROM STOJOU
WHERE STOFCY_0 = '${SITE}'
  AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD')
  AND ITMREF_0 IN (${articles.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})
GROUP BY ITMREF_0, TRUNC(IPTDAT_0,${grain === 'semaine' ? "'IW'" : "'MM'"})
`

export interface StockValuationPoint {
  periode: string // clé : YYYY-MM (mois) ou YYYY-Www (semaine ISO)
  label: string // ex. "janv. 26" ou "sem. 26"
  valeur: number // valeur du stock en fin de période, au PMP actuel (€)
  qte: number // quantité totale en fin de période
}

export interface StockCategorieRow {
  categorie: string
  valeur: number
  part: number // % du total actuel (0-100)
}

export interface StockArticleRow {
  article: string
  designation: string
  categorie: string
  stock: number // quantité en stock (PHYSTO + CTLSTO)
  pmp: number
  valeur: number // stock × pmp (€)
}

export interface StockValuationKpi {
  grain: StockGrain
  series: StockValuationPoint[]
  totalActuel: number
  totalDebut: number // valeur à la première période affichée
  deltaPct: number // (actuel − début) / début
  categories: StockCategorieRow[]
  articles: StockArticleRow[] // trié par valeur décroissante
  nbArticles: number
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

const num = (v: string | null | undefined): number => Number.parseFloat(v ?? '0') || 0

/** Clé de période pour apparier flux ↔ périodes de référence. */
function periodKey(d: Date, grain: StockGrain): string {
  if (grain === 'semaine') {
    // Semaine ISO : on prend le lundi de la semaine (le trunc 'IW' Oracle
    // ramène aussi au lundi). Format YYYY-Www.
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7))
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((tmp.getTime() - yearStart.getTime()) / 86_400_000 / 7) + 1
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Label humain : "janv. 26" ou "sem. 26". */
function periodLabel(d: Date, grain: StockGrain): string {
  if (grain === 'semaine') {
    return `sem. ${periodKey(d, 'semaine').slice(-2)}`
  }
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(d)
}

/** Périodes de référence entre `from` et `to`, du plus ancien au plus récent.
 *  Chaque période est alignée sur le début de mois (grain mois) ou le lundi
 *  (grain semaine). La clé doit matcher celle renvoyée par TRUNC Oracle. */
function buildRefPeriods(
  grain: StockGrain,
  from: Date,
  to: Date
): Array<{ key: string; label: string; date: Date }> {
  const periods: Array<{ key: string; label: string; date: Date }> = []

  if (grain === 'semaine') {
    // Recule `d` au lundi de sa semaine.
    const toMonday = (d: Date) => {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      const day = m.getUTCDay() || 7
      m.setUTCDate(m.getUTCDate() + 1 - day)
      return m
    }
    let cur = toMonday(from)
    const end = toMonday(to)
    while (cur.getTime() <= end.getTime()) {
      periods.push({ key: periodKey(cur, 'semaine'), label: periodLabel(cur, 'semaine'), date: new Date(cur) })
      cur = new Date(cur.getTime() + 7 * 86_400_000)
    }
  } else {
    // Premier jour de chaque mois de `from` à `to`.
    let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
    while (cur.getTime() <= end.getTime()) {
      periods.push({ key: periodKey(cur, 'mois'), label: periodLabel(cur, 'mois'), date: new Date(cur) })
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
    }
  }
  return periods
}

/** Défaut : 12 périodes glissantes jusqu'à `refDate`. Exporté pour que le
 *  contrôleur puisse résoudre la plage (clé de cache stable) avant l'appel. */
export function defaultStockRange(grain: StockGrain, refDate: Date): { from: Date; to: Date } {
  const to = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()))
  if (grain === 'semaine') {
    const from = new Date(to.getTime() - 11 * 7 * 86_400_000)
    return { from, to }
  }
  const from = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 11, 1))
  return { from, to }
}

export class StockValuationRepository {
  async getStockValuationKpi(
    refDate: Date = new Date(),
    grain: StockGrain = 'mois',
    fromParam?: Date,
    toParam?: Date
  ): Promise<StockValuationKpi> {
    const { from, to } =
      fromParam && toParam ? { from: fromParam, to: toParam } : defaultStockRange(grain, refDate)
    const refPeriods = buildRefPeriods(grain, from, to)
    const fromStr = toYYYYMMDD(from)

    // --- Base articles (passe en une requête : ~700 lignes). ---
    const baseDb = new X3Database()
    let baseRows: RawRow[] = []
    try {
      baseRows = await baseDb.raw(buildBaseSql(fromStr))
    } finally {
      await baseDb.destroy()
    }

    // --- Flux STOJOU paginé par chunks d'articles ---
    // Le flux complet dépasse le seuil de lignes du web service SOAP Syracuse
    // (resultXml is nil). On découpe la population en tranches de CHUNK_SIZE
    // articles (même motif que retard_repository.ts qui chunk le stock dispo).
    const CHUNK_SIZE = 120
    const allArticles = [...new Set(baseRows.map((r) => r.ARTICLE?.trim() ?? '').filter(Boolean))]
    const fluxRows: RawRow[] = []
    const fluxDb = new X3Database()
    try {
      for (let i = 0; i < allArticles.length; i += CHUNK_SIZE) {
        const chunk = allArticles.slice(i, i + CHUNK_SIZE)
        const rows: RawRow[] = await fluxDb.raw(buildFluxSql(fromStr, chunk, grain))
        fluxRows.push(...rows)
      }
    } finally {
      await fluxDb.destroy()
    }

    // --- Indexer les flux par article → (période → net qté) ---
    const fluxByArticle = new Map<string, Map<string, number>>()
    for (const row of fluxRows) {
      const article = row.ARTICLE?.trim() ?? ''
      if (!article) continue
      const d = parseX3Date(row.PERIODE)
      if (!d) continue
      const key = periodKey(d, grain)
      let perPeriod = fluxByArticle.get(article)
      if (!perPeriod) {
        perPeriod = new Map()
        fluxByArticle.set(article, perPeriod)
      }
      perPeriod.set(key, num(row.NETQ))
    }

    // --- Rembobinage par article + agrégation ---
    // seriesAcc[i] = total valeur/qté de fin de période i, cumul sur tous les articles.
    const seriesAcc = refPeriods.map(() => ({ valeur: 0, qte: 0 }))
    const catValues = new Map<string, number>()
    const articleRows: StockArticleRow[] = []

    // refDate comme ancrage réel : le stock à refDate = stock actuel (ITMMVT)
    // moins les mouvements des périodes POSTÉRIEURES à refDate. Pour refDate ≈
    // aujourd'hui, aucune période n'est postérieure → stkAnchor = stkNow (inchangé).
    const toKey = refPeriods[refPeriods.length - 1]?.key

    for (const row of baseRows) {
      const article = row.ARTICLE?.trim() ?? ''
      const stkNow = num(row.STK)
      const pmp = num(row.PMP)
      const cat = (row.CATEGORIE?.trim() || '(sans cat.)').toUpperCase()

      const flux = fluxByArticle.get(article)

      // Stock à refDate : on retranche les mouvements des périodes après la dernière
      // période affichée (celle contenant refDate). Comparaison lexicographique des
      // clés (YYYY-MM et YYYY-Www se trient naturellement).
      let postRefQty = 0
      if (flux && toKey) {
        for (const [key, q] of flux) {
          if (key > toKey) postRefQty += q
        }
      }
      const stkAnchor = stkNow - postRefQty
      const valeur = stkAnchor * pmp

      // Rembobinage depuis stkAnchor : du plus récent (i = len-1) au plus ancien.
      // runningSub = Σ des qtés nettes des périodes PLUS RÉCENTES que i.
      let runningQtySub = 0
      for (let i = refPeriods.length - 1; i >= 0; i--) {
        const qtyClose = stkAnchor - runningQtySub
        seriesAcc[i].valeur += qtyClose * pmp
        seriesAcc[i].qte += qtyClose
        const f = flux?.get(refPeriods[i].key)
        if (f) runningQtySub += f
      }

      catValues.set(cat, (catValues.get(cat) ?? 0) + valeur)
      articleRows.push({
        article,
        designation: row.DESIGNATION?.trim() ?? '',
        categorie: cat,
        stock: Math.round(stkAnchor * 100) / 100,
        pmp: Math.round(pmp * 1_000_000) / 1_000_000,
        valeur: Math.round(valeur * 100) / 100,
      })
    }

    const series: StockValuationPoint[] = refPeriods.map((p, i) => ({
      periode: p.key,
      label: p.label,
      valeur: Math.round(seriesAcc[i].valeur * 100) / 100,
      qte: Math.round(seriesAcc[i].qte),
    }))

    const totalActuel = series[series.length - 1]?.valeur ?? 0
    const totalDebut = series[0]?.valeur ?? 0
    const deltaPct =
      totalDebut !== 0
        ? Math.round(((totalActuel - totalDebut) / Math.abs(totalDebut)) * 1000) / 10
        : 0

    const categories: StockCategorieRow[] = [...catValues.entries()]
      .map(([categorie, valeur]) => ({
        categorie,
        valeur: Math.round(valeur * 100) / 100,
        part: totalActuel > 0 ? Math.round((valeur / totalActuel) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.valeur - a.valeur)
      .slice(0, 5)

    const articles = articleRows.sort((a, b) => b.valeur - a.valeur)

    return {
      grain,
      series,
      totalActuel,
      totalDebut,
      deltaPct,
      categories,
      articles,
      nbArticles: baseRows.length,
    }
  }
}
