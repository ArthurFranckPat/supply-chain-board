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

/** Base d'UN article : stock + PMP actuels sur AE1, identité (désignation,
 *  catégorie, famille d'usage) et paramètres logistiques — délai de réappro,
 *  lots, stock de sécurité, fournisseur par défaut.
 *
 *  `ITMFACILIT` porte les paramètres de réappro **par site** : la jointure doit
 *  être scopée sur `STOFCY_0`, sinon un article multi-site remonte le délai
 *  d'un autre site. `ITMBPS.DEFBPSFLG_0 = 2` désigne le fournisseur par défaut
 *  (les autres lignes sont des fournisseurs alternatifs).
 *
 *  Les trois jointures sont des LEFT JOIN : un article fabriqué n'a pas de
 *  fournisseur, et une fiche sans paramètres de réappro reste consultable.
 *  Pas de filtre ITMSTA/TCLCOD : la sheet de détail doit répondre pour tout
 *  article cliqué dans le KPI, même sorti du référentiel actif. */
const buildArticleBaseSql = (article: string) => `
SELECT
  M.ITMREF_0    AS ARTICLE,
  M.ITMDES1_0   AS DESIGNATION,
  M.TCLCOD_0    AS CATEGORIE,
  M.YFAMSTAT7_0 AS FAMILLE,
  V.PHYSTO_0    AS STK_A,
  V.CTLSTO_0    AS STK_Q,
  (V.PHYSTO_0 + V.CTLSTO_0) AS STK,
  V.AVC_0       AS PMP,
  F.OFS_0       AS DELAI,
  F.MFGLOTQTY_0 AS LOT_TECH,
  F.REOMINQTY_0 AS LOT_ECO,
  F.SAFSTO_0    AS STK_SECU,
  P.BPSNUM_0    AS FOURNISSEUR_CODE,
  S.BPSNAM_0    AS FOURNISSEUR_NOM
FROM ITMMASTER M
INNER JOIN ITMMVT V ON V.ITMREF_0 = M.ITMREF_0 AND V.STOFCY_0 = '${SITE}'
LEFT JOIN ITMFACILIT F ON F.ITMREF_0 = M.ITMREF_0 AND F.STOFCY_0 = '${SITE}'
LEFT JOIN ITMBPS P ON P.ITMREF_0 = M.ITMREF_0 AND P.DEFBPSFLG_0 = 2
LEFT JOIN BPSUPPLIER S ON S.BPSNUM_0 = P.BPSNUM_0
WHERE M.ITMREF_0 = '${article.replace(/'/g, "''")}'
`

/**
 * Flux agrégé par article × période (entrées, sorties, net qté).
 *
 * **Agrégation en deux temps : d'abord le net par document, ensuite la
 * période.** STOJOU est un journal d'écritures, pas d'événements physiques :
 * une même opération y laisse plusieurs lignes qui se compensent. Sommer les
 * `QTYSTU_0 > 0` compte donc des entrées qui n'ont jamais eu lieu.
 *
 * Deux cas mesurés sur `11022900` (composant chinois, livré toutes les 2
 * semaines) :
 *  - **Reclassements internes.** TRSTYP 7 (emplacement), 8 (statut qualité
 *    Q→A), 9, 21, 35 s'écrivent toujours en paires ±X, même document, même
 *    jour. Sur le site AE1 en 12 mois, ils pèsent 96 M + 47 M + 3,7 M de
 *    fausses entrées pour un net rigoureusement nul, contre 69 M d'entrées
 *    réelles en TRSTYP 1.
 *  - **Contrepassations intra-document.** Même à l'intérieur d'une réception :
 *    `REC2510AE100093` porte +3528, −3528, +3528 le même jour, même lot, même
 *    statut. Livraison réelle 3528, journal brut 7056 en entrée et 3528 en
 *    sortie. Un filtre sur TRSTYP ne l'aurait pas rattrapé.
 *
 * Le net par (article, période, document) traite les deux d'un coup : une paire
 * qui se compense disparaît, une contrepassation se replie sur sa quantité
 * réelle. Résultat sur `11022900` : 28 semaines d'entrées au lieu de 43, en
 * multiples de 3528 (le conditionnement), une semaine sur deux — le rythme
 * réel de l'approvisionnement.
 *
 * `NETQ` est mathématiquement inchangé (somme de sommes), donc la
 * reconstruction du stock l'est aussi : ce correctif ne touche que les barres
 * de flux. Vérifié semaine à semaine (issue #88).
 *
 * Filtré par liste d'articles (chunk) — le flux complet dépasse le seuil de
 * lignes du web service SOAP Syracuse (resultXml is nil). Le GROUP BY interne
 * reste côté Oracle : le nombre de lignes rendues au SOAP est identique, donc
 * le coût ZSOAPSQL aussi.
 */
const buildFluxSql = (fromStr: string, articles: string[], grain: StockGrain) => {
  const trunc = grain === 'semaine' ? "'IW'" : "'MM'"
  return `
SELECT
  ARTICLE,
  PERIODE,
  SUM(CASE WHEN NET_DOC > 0 THEN NET_DOC ELSE 0 END) AS ENTREE,
  SUM(CASE WHEN NET_DOC < 0 THEN ABS(NET_DOC) ELSE 0 END) AS SORTIE,
  SUM(NET_DOC) AS NETQ
FROM (
  SELECT
    ITMREF_0 AS ARTICLE,
    TRUNC(IPTDAT_0,${trunc}) AS PERIODE,
    SUM(QTYSTU_0) AS NET_DOC
  FROM STOJOU
  WHERE STOFCY_0 = '${SITE}'
    AND IPTDAT_0 >= TO_DATE('${fromStr}','YYYYMMDD')
    AND ITMREF_0 IN (${articles.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})
  GROUP BY ITMREF_0, TRUNC(IPTDAT_0,${trunc}), VCRTYP_0, VCRNUM_0
)
GROUP BY ARTICLE, PERIODE
`
}

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

/** Point hebdomadaire de l'historique d'un article (sheet de détail dashboard).
 *  Valeurs = quantité × PMP actuel (même convention de valorisation que le KPI). */
export interface StockArticleHistoryPoint {
  periode: string // clé YYYY-Www (semaine ISO)
  label: string // ex. "sem. 26"
  qte: number // stock fin de semaine
  valeur: number // qte × PMP actuel (€)
  entreeQte: number
  sortieQte: number
  entreeVal: number
  sortieVal: number
}

/** Paramètres de pilotage de l'article. Tous optionnels : ils viennent de
 *  jointures LEFT (fiche site, fournisseur par défaut) qui peuvent manquer. */
export interface StockArticleLogistique {
  famille: string | null // YFAMSTAT7_0 — famille d'usage
  delaiReapproJours: number | null // ITMFACILIT.OFS_0
  lotTechnique: number | null // ITMFACILIT.MFGLOTQTY_0
  lotEconomique: number | null // ITMFACILIT.REOMINQTY_0
  stockSecurite: number | null // ITMFACILIT.SAFSTO_0
  fournisseurCode: string | null // ITMBPS.BPSNUM_0 (DEFBPSFLG_0 = 2)
  fournisseurNom: string | null // BPSUPPLIER.BPSNAM_0
}

export interface StockArticleHistory {
  article: string
  designation: string
  categorie: string
  stock: number // stock actuel (ancré à refDate)
  // Répartition par statut, lue telle quelle dans ITMMVT — donc NON rembobinée :
  // elle ne vaut que pour refDate = aujourd'hui, le seul cas de la sheet.
  stockA: number // PHYSTO — statut A (disponible)
  stockQ: number // CTLSTO — statut Q (contrôle réception)
  pmp: number
  valeur: number // stock × pmp (€)
  logistique: StockArticleLogistique
  grain: 'semaine'
  series: StockArticleHistoryPoint[] // du plus ancien au plus récent
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

const num = (v: string | null | undefined): number => Number.parseFloat(v ?? '0') || 0

/** Clé de semaine ISO d'une date (« 2026-W31 », lundi) — partagée avec le
 *  loader de projection (stock_detail_loader) pour seaux futurs. */
export function isoWeekKey(d: Date): string {
  return periodKey(d, 'semaine')
}

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
      periods.push({
        key: periodKey(cur, 'semaine'),
        label: periodLabel(cur, 'semaine'),
        date: new Date(cur),
      })
      cur = new Date(cur.getTime() + 7 * 86_400_000)
    }
  } else {
    // Premier jour de chaque mois de `from` à `to`.
    let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1))
    while (cur.getTime() <= end.getTime()) {
      periods.push({
        key: periodKey(cur, 'mois'),
        label: periodLabel(cur, 'mois'),
        date: new Date(cur),
      })
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1))
    }
  }
  return periods
}

/** Défaut : 12 périodes glissantes jusqu'à `refDate`. Exporté pour que le
 *  contrôleur puisse résoudre la plage (clé de cache stable) avant l'appel. */
export function defaultStockRange(grain: StockGrain, refDate: Date): { from: Date; to: Date } {
  const to = new Date(
    Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate())
  )
  if (grain === 'semaine') {
    const from = new Date(to.getTime() - 11 * 7 * 86_400_000)
    return { from, to }
  }
  const from = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - 11, 1))
  return { from, to }
}

/**
 * Agrège des lignes de flux document (article, jour, netDoc) en
 * (article → période → net qté cumulée). Pure, testable sans X3 — `buildFluxSql`
 * agrège déjà par période côté SQL, donc un seul appel `add` par
 * (article, période) ici : l'accumulation est un no-op dans ce cas, pas une
 * double-comptée.
 */
export function aggregateFluxByArticlePeriod(
  rows: { article: string; jour: Date; netDoc: number }[],
  grain: StockGrain
): Map<string, Map<string, number>> {
  const fluxByArticle = new Map<string, Map<string, number>>()
  for (const { article, jour, netDoc } of rows) {
    if (!article) continue
    const key = periodKey(jour, grain)
    let perPeriod = fluxByArticle.get(article)
    if (!perPeriod) {
      perPeriod = new Map()
      fluxByArticle.set(article, perPeriod)
    }
    perPeriod.set(key, (perPeriod.get(key) ?? 0) + netDoc)
  }
  return fluxByArticle
}

export class StockValuationRepository {
  /**
   * Flux STOJOU agrégé par (article, période) — X3 direct, chunké par article.
   */
  private async getFluxByArticlePeriod(
    grain: StockGrain,
    articles: string[],
    fromStr: string
  ): Promise<Map<string, Map<string, number>>> {
    // Chunké par article : le flux complet dépasse le seuil de
    // lignes du web service SOAP Syracuse (resultXml is nil), même motif que
    // retard_repository.ts qui chunk le stock dispo.
    const CHUNK_SIZE = 120
    const docRows: { article: string; jour: Date; netDoc: number }[] = []
    const fluxDb = new X3Database()
    try {
      for (let i = 0; i < articles.length; i += CHUNK_SIZE) {
        const chunk = articles.slice(i, i + CHUNK_SIZE)
        const rows: RawRow[] = await fluxDb.raw(buildFluxSql(fromStr, chunk, grain))
        for (const row of rows) {
          const article = row.ARTICLE?.trim() ?? ''
          const d = parseX3Date(row.PERIODE)
          if (!article || !d) continue
          docRows.push({ article, jour: d, netDoc: num(row.NETQ) })
        }
      }
    } finally {
      await fluxDb.destroy()
    }
    return aggregateFluxByArticlePeriod(docRows, grain)
  }

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

    const allArticles = [...new Set(baseRows.map((r) => r.ARTICLE?.trim() ?? '').filter(Boolean))]

    // --- Flux STOJOU (X3 direct) ---
    // Le rembobinage a besoin du flux de `from` jusqu'à AUJOURD'HUI (pas juste
    // jusqu'à `to`) — cf. docstring du module : on reconstruit le passé en
    // défaisant les mouvements POSTÉRIEURS à chaque période depuis le stock
    // actuel.
    const fluxByArticle = await this.getFluxByArticlePeriod(grain, allArticles, fromStr)

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

  /**
   * Historique hebdomadaire d'UN article sur 52 semaines glissantes (sheet de
   * détail du KPI stock). Même méthode de rembobinage que le KPI agrégé :
   *   QTE_CLOSE(S) = stkAnchor − Σ NETQ(semaines postérieures à S)
   * avec stkAnchor = stock actuel − mouvements postérieurs à la dernière
   * semaine affichée (invariant si refDate ≈ aujourd'hui). Les flux valorisés
   * appliquent le PMP actuel, comme la courbe de stock.
   *
   * Retourne `null` si l'article n'a pas de fiche stock sur AE1.
   */
  async getArticleStockHistory(
    article: string,
    refDate: Date = new Date()
  ): Promise<StockArticleHistory | null> {
    // 52 semaines glissantes (12 mois) : buildRefPeriods aligne sur les lundis,
    // soit 53 points hebdomadaires entre `from` et `to`.
    const to = new Date(
      Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate())
    )
    const from = new Date(to.getTime() - 52 * 7 * 86_400_000)
    const refPeriods = buildRefPeriods('semaine', from, to)
    const fromStr = toYYYYMMDD(from)

    const db = new X3Database()
    let baseRows: RawRow[] = []
    let fluxRows: RawRow[] = []
    try {
      baseRows = await db.raw(buildArticleBaseSql(article))
      if (baseRows.length === 0) return null
      fluxRows = await db.raw(buildFluxSql(fromStr, [article], 'semaine'))
    } finally {
      await db.destroy()
    }

    const row = baseRows[0]
    const stkNow = num(row.STK)
    const pmp = num(row.PMP)

    // Flux indexés par semaine (clé YYYY-Www, comme le TRUNC 'IW' Oracle).
    const fluxByPeriod = new Map<string, { net: number; entree: number; sortie: number }>()
    for (const f of fluxRows) {
      const d = parseX3Date(f.PERIODE)
      if (!d) continue
      fluxByPeriod.set(periodKey(d, 'semaine'), {
        net: num(f.NETQ),
        entree: num(f.ENTREE),
        sortie: num(f.SORTIE),
      })
    }

    // Ancrage à refDate : retranche les mouvements des semaines postérieures à la
    // dernière période affichée (comparaison lexicographique des clés YYYY-Www).
    const toKey = refPeriods[refPeriods.length - 1]?.key
    let postRefQty = 0
    if (toKey) {
      for (const [key, f] of fluxByPeriod) {
        if (key > toKey) postRefQty += f.net
      }
    }
    const stkAnchor = stkNow - postRefQty

    const round2 = (v: number) => Math.round(v * 100) / 100

    // Rembobinage du plus récent au plus ancien : runningSub = Σ des qtés nettes
    // des semaines PLUS RÉCENTES que i.
    const series: StockArticleHistoryPoint[] = refPeriods.map((p) => ({
      periode: p.key,
      label: p.label,
      qte: 0,
      valeur: 0,
      entreeQte: 0,
      sortieQte: 0,
      entreeVal: 0,
      sortieVal: 0,
    }))
    let runningQtySub = 0
    for (let i = refPeriods.length - 1; i >= 0; i--) {
      const qtyClose = stkAnchor - runningQtySub
      // Plancher à 0 : le stock physique ne peut pas être négatif. Une valeur
      // reconstruite négative est un écart de réconciliation STOJOU↔ITMMVT
      // (net du journal sur-compté), pas un stock réel — on borne l'affichage.
      const qtyFloor = Math.max(0, qtyClose)
      const f = fluxByPeriod.get(refPeriods[i].key)
      const entree = f?.entree ?? 0
      const sortie = f?.sortie ?? 0
      series[i] = {
        periode: refPeriods[i].key,
        label: refPeriods[i].label,
        qte: round2(qtyFloor),
        valeur: round2(qtyFloor * pmp),
        entreeQte: round2(entree),
        sortieQte: round2(sortie),
        entreeVal: round2(entree * pmp),
        sortieVal: round2(sortie * pmp),
      }
      if (f) runningQtySub += f.net
    }

    // Paramètres logistiques : `null` quand la donnée est absente, jamais 0.
    // Un délai de réappro inconnu et un délai nul ne se pilotent pas pareil —
    // l'UI affiche « — » dans le premier cas. Le stock de sécurité fait
    // exception : X3 y écrit un vrai 0 (pas de stock de sécurité paramétré),
    // qui est une information, donc seule une ligne ITMFACILIT absente le rend
    // nul.
    const text = (v: string | null | undefined): string | null => v?.trim() || null
    const optNum = (v: string | null | undefined): number | null => {
      if (v === null || v === undefined || v.trim() === '') return null
      const n = Number.parseFloat(v)
      return Number.isFinite(n) ? n : null
    }

    return {
      article: article.trim(),
      designation: row.DESIGNATION?.trim() ?? '',
      categorie: (row.CATEGORIE?.trim() || '(sans cat.)').toUpperCase(),
      stock: round2(stkAnchor),
      stockA: round2(num(row.STK_A)),
      stockQ: round2(num(row.STK_Q)),
      pmp: Math.round(pmp * 1_000_000) / 1_000_000,
      valeur: round2(stkAnchor * pmp),
      logistique: {
        famille: text(row.FAMILLE),
        delaiReapproJours: optNum(row.DELAI),
        lotTechnique: optNum(row.LOT_TECH),
        lotEconomique: optNum(row.LOT_ECO),
        stockSecurite: optNum(row.STK_SECU),
        fournisseurCode: text(row.FOURNISSEUR_CODE),
        fournisseurNom: text(row.FOURNISSEUR_NOM),
      },
      grain: 'semaine',
      series,
    }
  }
}
