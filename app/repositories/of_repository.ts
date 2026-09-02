import type { Flow } from '#app/domain/models/flow'
import LocalMenu from '#models/local_menu'
import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import staticSync from '#services/static_sync_service'

/**
 * Ordre de fabrication (ferme / planifié / suggéré), lu dans la vue planning
 * temps réel ORDERS (issue #32). Source unique : remplace MFGITM/MFGHEAD pour
 * les fermes/planifiés ET CBNDET pour les suggestions. ORDERS est mis à jour
 * immédiatement par FUNMAUTR/FUNGBENCH → une suggestion affermie y disparaît,
 * pas de drift ni de blacklist.
 *
 * Pas de JOIN ITMMASTER côté X3 (SOAP-06 : timeout sur jointure massive). La
 * désignation est résolue depuis le référentiel local synchronisé (SQLite via
 * staticSync), comme le font déjà les autres lecteurs X3.
 */
export interface ManufacturingOrder {
  numOf: string
  article: string
  designation: string | null
  status: 1 | 2 | 3
  statutLabel: string | null
  typeOfLabel: string | null
  quantity: number // reste à produire (RMNEXTQTY)
  quantityLaunched: number // qté lancée (EXTQTY)
  quantityDone: number // qté réalisée (CPLQTY)
  unit: string | null
  startDate: Date | null
  endDate: Date | null
  /** Date de création de l'OF (ORDERS.CREDAT_0) — seul getManufacturingOrderByNum la renseigne
   *  (détail OF uniquement, pas les requêtes liste — évite d'alourdir le O(n²) ZSOAPSQL). */
  createdDate?: Date | null
  /** Opérateur créateur (ORDERS.CREUSR_0, code X3 brut — pas d'annuaire de noms complets). */
  createdBy?: string | null
}

type RawRow = Record<string, string | null>

// Lookback pour les OF (via env RETARD_LOOKBACK_DAYS, même variable que la vue retards).
// Élimine les OF très en retard (anomalies ERP) → réduit drastiquement les lignes ZSOAPSQL O(n²).
const OF_LOOKBACK_DAYS = Number.parseInt(process.env.RETARD_LOOKBACK_DAYS ?? '90', 10)

// Évite le décalage UTC+1/+2 : `toISOString()` à minuit local donne hier UTC.
// C'est désormais la SEULE conversion de date du fichier : la variante UTC
// (`toISOString().slice(0,10)`) ne servait plus qu'à la requête ORDERS
// monolithique, remplacée par le découpage en fenêtres (#183). Toutes les
// bornes passent donc par la même fonction — c'est ce qui garantit que les
// fenêtres se raboutent exactement.
function toLocalYYYYMMDD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${da}`
}

/**
 * Largeur d'une fenêtre de découpage, en jours d'ENDDAT (#183).
 *
 * Ce n'est PAS un réglage de confort : c'est la seule variable qui commande le
 * coût de la requête la plus lourde de l'app. `ZSOAPSQL` concatène ses lignes
 * dans un CLOB, en O(n²) sur le nombre de lignes rendues PAR APPEL — donc le
 * prix à la ligne n'est pas constant, il grimpe avec la taille du lot. Mesuré
 * sur X3 prod calme le 02/09/2026, champ `exec` des `technicalInfos` :
 *
 *   12 823 lignes en 1 appel → 18 000 ms  (1,40 ms/ligne)
 *    4 899 lignes en 1 appel →  2 432 ms  (0,50 ms/ligne)
 *    1 700 lignes en 1 appel →    256 ms  (0,15 ms/ligne)
 *      500 lignes en 1 appel →    130 ms  (0,26 ms/ligne)
 *
 * L'optimum n'est donc ni « le plus gros » ni « le plus petit ». En dessous de
 * ~1 000 lignes le plancher d'un appel SOAP (~65 ms mesurés, à vide) domine et
 * on paie du transport pour rien ; au-dessus de ~2 000 la quadratique reprend
 * la main. 45 jours place les fenêtres pleines autour de 1 500-1 700 lignes,
 * dans le creux de la courbe.
 *
 * Ce découpage seul, à périmètre inchangé, ramenait 18 s à ~4 s d'exec pour les
 * mêmes 12 823 lignes. Combiné à la borne haute ci-dessous, le pool complet
 * tient en 6 appels et ~1,8 s.
 */
const ORDERS_WINDOW_DAYS = 45

/**
 * BORNE HAUTE du pool d'OF, en jours (#183).
 *
 * Ce n'est PAS un détail de découpage : c'est un choix de PÉRIMÈTRE. Au-delà,
 * les OF ne sont plus lus du tout — `getOrders()` ne rend donc plus « tous les
 * OF ouverts », il rend ceux dont la fin tombe dans `[J-lookback, J+lookahead)`.
 *
 * Pourquoi elle existe : il n'y en avait AUCUNE. La requête n'avait qu'une
 * borne basse, et le CBN remplissait le vide. Composition mesurée le
 * 02/09/2026 sur AE1 : 12 865 lignes, dont 87,4 % de suggestions (WIPSTA=3),
 * et 5 482 lignes au-delà de J+180 — une zone où il ne reste plus un seul OF
 * ferme. Le warmer rechargeait tout ça ~180 fois par jour.
 *
 * Ce que la borne à 180 j retire, mesuré et non estimé :
 *  - 5 482 lignes sur 12 955, soit 42 % du volume ;
 *  - 1 seul OF ferme, `F513-01095` (article PI0150) — une date qui a tout d'une
 *    anomalie, du même genre que celles que la borne basse écarte déjà.
 *
 * Ce que ça change À L'ÉCRAN : presque rien, et la raison mérite d'être sue.
 * `searchOf`/`searchPf` n'interrogent pas X3 — elles FILTRENT les cartes déjà
 * affichées, qui viennent de `getOrdersForWindow` (fenêtre STRDAT, 14 j par
 * défaut, 90 au maximum). Un article sorti du pool mais absent du board ne se
 * voit donc nulle part : la recherche rendait son code, le board n'avait aucune
 * carte à filtrer, l'écran était déjà vide.
 *
 * Le seul cas qui régresse vraiment est un OF AFFICHABLE (`STRDAT ≤ J+90`) dont
 * la fin dépasse la borne : visible sur le board, mais plus dans le pool, donc
 * masqué par la recherche au lieu d'être mis en évidence. Mesuré le 02/09/2026 :
 * TROIS OF, tous suggérés, à cycle de 7-8 mois — `SGAE10663307329` (CE4218),
 * `SGAE10663317507` (CE4091), `SGAE10663317523` (CE4092).
 *
 * C'est la vraie mesure du risque de cette borne, et c'est aussi le premier
 * endroit où regarder si quelqu'un signale un OF introuvable dans la recherche.
 *
 * Surchargeable par `OF_LOOKAHEAD_DAYS` sans redéploiement : la valeur juste
 * dépend de ce que les écrans montrent, et elle se règle à l'usage. Le symptôme
 * d'une borne trop courte est un OF introuvable dans la recherche du board,
 * jamais une erreur.
 */
const OF_LOOKAHEAD_DAYS = Number.parseInt(process.env.OF_LOOKAHEAD_DAYS ?? '180', 10)

/**
 * Fenêtres [début, fin) contiguës couvrant `[from, J+OF_LOOKAHEAD_DAYS)`.
 *
 * TOUTES FERMÉES : il n'y a plus de fenêtre ouverte finale, et c'est
 * intentionnel — la borne haute est un périmètre assumé, pas une limite de
 * découpage. Ce qui tombe au-delà n'est pas lu.
 *
 * Semi-ouvertes, donc l'union est exacte : aucun OF compté deux fois, aucun
 * perdu sur une borne. Vérifié contre la requête monolithique — mêmes lignes
 * des deux côtés sur la plage commune.
 *
 * Fonction pure et exportée pour être testée sans X3 : c'est le seul endroit
 * où une erreur de bornes fausserait silencieusement le board (un trou d'un
 * jour ne se voit pas, il fait juste disparaître des OF).
 */
export function buildOrdersWindows(from: Date, today: Date = new Date()): Array<[string, string]> {
  const windows: Array<[string, string]> = []

  /**
   * MINUIT LOCAL des deux côtés, et c'est un correctif, pas une coquetterie.
   *
   * Les bornes finissent en `YYYYMMDD` : l'heure ne survit pas à la conversion,
   * mais elle survit à la COMPARAISON `cursor < horizon`. Or les deux dates
   * viennent d'appels à `new Date()` distincts — `fetch()` calcule `from`, puis
   * `buildOrdersWindows` calcule `today` — séparés de quelques millisecondes.
   * Le curseur finissait donc quelques ms AVANT l'horizon au dernier tour, et la
   * boucle produisait une fenêtre de largeur nulle `[20270301, 20270301)` :
   * un appel SOAP de plus (~65 ms mesurés), zéro ligne, à chaque chargement.
   *
   * Normaliser au jour rend l'arithmétique exacte : `setDate` préserve minuit
   * local même à travers un changement d'heure.
   */
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  const horizon = midnight(today)
  horizon.setDate(horizon.getDate() + OF_LOOKAHEAD_DAYS)

  const cursor = midnight(from)
  while (cursor < horizon) {
    const next = new Date(cursor)
    next.setDate(next.getDate() + ORDERS_WINDOW_DAYS)
    const end = next < horizon ? next : horizon
    windows.push([toLocalYYYYMMDD(cursor), toLocalYYYYMMDD(end)])
    cursor.setTime(end.getTime())
  }
  return windows
}

/**
 * WIPTYP=5 = fabrication. WIPSTA 1/2/3 = Ferme/Planifié/Suggéré. ORDERS seule.
 *
 * Bornes semi-ouvertes `[from, to)` — ne pas les passer en `BETWEEN`, qui est
 * fermé des deux côtés et compterait deux fois les OF pile sur une borne.
 */
const buildSql = (fromStr: string, toStr: string) => `
SELECT
  VCRNUM_0    AS NUM,
  ITMREF_0    AS ARTICLE,
  WIPSTA_0    AS STA,
  EXTQTY_0    AS LAUNCHED,
  CPLQTY_0    AS DONE,
  RMNEXTQTY_0 AS REMAIN,
  STRDAT_0    AS STRDAT,
  ENDDAT_0    AS ENDDAT
FROM ORDERS
WHERE WIPTYP_0 = 5
  AND WIPSTA_0 IN (1, 2, 3)
  AND RMNEXTQTY_0 > 0
  AND ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
  AND ENDDAT_0 < TO_DATE('${toStr}', 'YYYYMMDD')
`

/** STRDAT in [from,to] — fenêtre courte → ZSOAPSQL O(n²) ×N+ plus rapide que lookback 90j ENDDAT. */
const buildWindowSql = (fromStr: string, toStr: string) => `
SELECT
  VCRNUM_0    AS NUM,
  ITMREF_0    AS ARTICLE,
  WIPSTA_0    AS STA,
  EXTQTY_0    AS LAUNCHED,
  CPLQTY_0    AS DONE,
  RMNEXTQTY_0 AS REMAIN,
  STRDAT_0    AS STRDAT,
  ENDDAT_0    AS ENDDAT
FROM ORDERS
WHERE WIPTYP_0 = 5
  AND WIPSTA_0 IN (1, 2, 3)
  AND RMNEXTQTY_0 > 0
  AND STRDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
  AND STRDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD')
`

/**
 * OFs qui peuvent encore SERVIR une demande de la fenêtre sans y DÉMARRER (issue #99) :
 * démarrés avant `from`, encore ouverts, fin ≤ `to`. Sans eux, un OF ferme déjà lancé
 * (ex. F126-48851, début 25/07, fin 28/07) sort du pool de matching et sa commande est
 * ré-allouée à une suggestion d'août — alors que X3 nette le stock prévisionnel sur les FINS.
 *
 * Borné aux articles ayant de la demande dans la fenêtre : sans ce filtre le delta pèse
 * ~1 340 lignes (tout le backlog usine), avec il en pèse ~14 (mesuré en PROD le 28/07/2026).
 * Sous-select plutôt qu'IN-list d'articles : rien à expédier dans le CLOB ZSOAPSQL.
 */
const buildMatchingDeltaSql = (fromStr: string, toStr: string) => `
SELECT
  VCRNUM_0    AS NUM,
  ITMREF_0    AS ARTICLE,
  WIPSTA_0    AS STA,
  EXTQTY_0    AS LAUNCHED,
  CPLQTY_0    AS DONE,
  RMNEXTQTY_0 AS REMAIN,
  STRDAT_0    AS STRDAT,
  ENDDAT_0    AS ENDDAT
FROM ORDERS
WHERE WIPTYP_0 = 5
  AND WIPSTA_0 IN (1, 2, 3)
  AND RMNEXTQTY_0 > 0
  AND NOT (STRDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
           AND STRDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD'))
  AND ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD')
  AND ITMREF_0 IN (
    SELECT ITMREF_0
    FROM ORDERS
    WHERE WIPTYP_0 = 1
      AND RMNEXTQTY_0 > 0
      AND ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
      AND ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD')
  )
`

function toNum(v: string | null | undefined): number {
  return Number.parseFloat(v ?? '0') || 0
}

export class X3OfRepository {
  /** Lit les ordres depuis ORDERS + enrichit la désignation depuis le référentiel local. */
  private async fetch(): Promise<{
    rows: RawRow[]
    label: (chapter: number, value: number | null) => string | null
    designations: Map<string, string>
  }> {
    const from = new Date()
    from.setDate(from.getDate() - OF_LOOKBACK_DAYS)
    const [rows, menuRows, articles] = await Promise.all([
      this.fetchWindowedRows(from),
      LocalMenu.query().whereIn('chapter', [317]),
      staticSync.readArticles().catch(() => []),
    ])
    const label = (chapter: number, value: number | null) =>
      menuRows.find((m) => m.chapter === chapter && m.value === value)?.label ?? null
    const designations = new Map<string, string>()
    for (const a of articles) if (a.code) designations.set(a.code, a.description)
    return { rows, label, designations }
  }

  /**
   * ORDERS en plusieurs appels fenêtrés au lieu d'un seul (#183).
   *
   * SÉQUENTIEL, et ce n'est pas une prudence par défaut : la parallélisation des
   * chunks SOAP a déjà été tentée dans ce dépôt sans gain. Le coût est le CPU de
   * `ZSOAPSQL` côté X3, pas l'attente réseau — les lancer ensemble déplace la
   * file, elle ne la raccourcit pas, et ça prendrait tous les slots de
   * `x3_concurrency` pour une seule page.
   *
   * Une connexion réutilisée pour toutes les fenêtres, détruite au bout :
   * l'ancienne version créait une `X3Database` par appel sans jamais la fermer.
   */
  private async fetchWindowedRows(from: Date): Promise<RawRow[]> {
    const db = new X3Database()
    try {
      const rows: RawRow[] = []
      for (const [start, end] of buildOrdersWindows(from)) {
        rows.push(...((await db.raw(buildSql(start, end))) as unknown as RawRow[]))
      }
      return rows
    } finally {
      await db.destroy()
    }
  }

  async getSupplyFlows(): Promise<Flow[]> {
    const { rows, label, designations } = await this.fetch()

    return rows.map((row) => {
      const status = Number.parseInt(row.STA ?? '0') as 1 | 2 | 3
      const article = row.ARTICLE?.trim() ?? ''
      return {
        article,
        quantity: toNum(row.REMAIN),
        direction: 'supply' as const,
        date: parseX3Date(row.ENDDAT),
        origin: {
          type: 'of' as const,
          id: row.NUM?.trim() ?? '',
          status,
          statutLabel: label(317, status),
          typeOf: null,
          typeOfLabel: null,
          designation: designations.get(article) ?? null,
        },
      }
    })
  }

  /**
   * Date d'affermissement (= création de l'OF ferme) par numéro d'OF, lue dans
   * ORDERS.CREDAT_0 (vue planning, #32). Quand une suggestion est affermie, elle
   * devient une ligne ORDERS WIPSTA=1 avec sa CREDAT → cette date matérialise le
   * lancement réel. Les numéros absents (pas dans ORDERS) ne figurent pas dans la map.
   */
  async getFirmDates(numOfs: string[]): Promise<Map<string, Date>> {
    const unique = [...new Set(numOfs.map((n) => n.trim()).filter(Boolean))]
    const out = new Map<string, Date>()
    if (unique.length === 0) return out

    const db = new X3Database()
    try {
      const safe = unique.filter((n) => /^[A-Za-z0-9_-]+$/.test(n))
      if (safe.length === 0) return out
      const inList = safe.map((n) => `'${n}'`).join(',')
      const rows = (await db.raw(
        `SELECT VCRNUM_0 AS NUM, CREDAT_0 AS CREDAT FROM ORDERS WHERE WIPTYP_0 = 5 AND VCRNUM_0 IN (${inList})`
      )) as unknown as RawRow[]
      for (const row of rows) {
        const numOf = row.NUM?.trim() ?? ''
        const date = parseX3Date(row.CREDAT)
        if (numOf && date) out.set(numOf, date)
      }
      return out
    } finally {
      await db.destroy()
    }
  }

  async getManufacturingOrders(): Promise<ManufacturingOrder[]> {
    const { rows, label, designations } = await this.fetch()

    return rows.map((row) => {
      const status = Number.parseInt(row.STA ?? '0') as 1 | 2 | 3
      const article = row.ARTICLE?.trim() ?? ''
      return {
        numOf: row.NUM?.trim() ?? '',
        article,
        designation: designations.get(article) ?? null,
        status,
        statutLabel: label(317, status),
        typeOfLabel: null,
        quantity: toNum(row.REMAIN),
        quantityLaunched: toNum(row.LAUNCHED),
        quantityDone: toNum(row.DONE),
        unit: null,
        startDate: parseX3Date(row.STRDAT),
        endDate: parseX3Date(row.ENDDAT),
      }
    })
  }

  /** Charge 1 OF par numéro — 1 ligne ZSOAPSQL, évite le lookback 90j de getManufacturingOrders(). */
  async getManufacturingOrderByNum(numOf: string): Promise<ManufacturingOrder | null> {
    const safe = numOf.replace(/'/g, "''")
    const sql = `
SELECT
  VCRNUM_0    AS NUM,
  ITMREF_0    AS ARTICLE,
  WIPSTA_0    AS STA,
  EXTQTY_0    AS LAUNCHED,
  CPLQTY_0    AS DONE,
  RMNEXTQTY_0 AS REMAIN,
  STRDAT_0    AS STRDAT,
  ENDDAT_0    AS ENDDAT,
  CREDAT_0    AS CREDAT,
  CREUSR_0    AS CREUSR
FROM ORDERS
WHERE WIPTYP_0 = 5
  AND VCRNUM_0 = '${safe}'
`
    const [rows, menuRows, articles] = await Promise.all([
      new X3Database().raw(sql) as unknown as RawRow[],
      LocalMenu.query().whereIn('chapter', [317]),
      staticSync.readArticles().catch(() => []),
    ])
    if (rows.length === 0) return null

    const label = (chapter: number, value: number | null) =>
      menuRows.find((m) => m.chapter === chapter && m.value === value)?.label ?? null
    const designations = new Map<string, string>()
    for (const a of articles) if (a.code) designations.set(a.code, a.description)

    const row = rows[0]
    const status = Number.parseInt(row.STA ?? '0') as 1 | 2 | 3
    const article = row.ARTICLE?.trim() ?? ''
    return {
      numOf: row.NUM?.trim() ?? '',
      article,
      designation: designations.get(article) ?? null,
      status,
      statutLabel: label(317, status),
      typeOfLabel: null,
      quantity: toNum(row.REMAIN),
      quantityLaunched: toNum(row.LAUNCHED),
      quantityDone: toNum(row.DONE),
      unit: null,
      startDate: parseX3Date(row.STRDAT),
      endDate: parseX3Date(row.ENDDAT),
      createdDate: parseX3Date(row.CREDAT),
      createdBy: row.CREUSR?.trim() || null,
    }
  }

  /** Exécute un SQL liste ORDERS et hydrate (libellé statut + désignation locale). */
  private async fetchOrders(sql: string): Promise<ManufacturingOrder[]> {
    const [rows, menuRows, articles] = await Promise.all([
      new X3Database().raw(sql) as unknown as RawRow[],
      LocalMenu.query().whereIn('chapter', [317]),
      staticSync.readArticles().catch(() => []),
    ])
    const label = (chapter: number, value: number | null) =>
      menuRows.find((m) => m.chapter === chapter && m.value === value)?.label ?? null
    const designations = new Map<string, string>()
    for (const a of articles) if (a.code) designations.set(a.code, a.description)

    return rows.map((row) => {
      const status = Number.parseInt(row.STA ?? '0') as 1 | 2 | 3
      const article = row.ARTICLE?.trim() ?? ''
      return {
        numOf: row.NUM?.trim() ?? '',
        article,
        designation: designations.get(article) ?? null,
        status,
        statutLabel: label(317, status),
        typeOfLabel: null,
        quantity: toNum(row.REMAIN),
        quantityLaunched: toNum(row.LAUNCHED),
        quantityDone: toNum(row.DONE),
        unit: null,
        startDate: parseX3Date(row.STRDAT),
        endDate: parseX3Date(row.ENDDAT),
      }
    })
  }

  /** OFs dont le STRDAT est dans [from, to] — fenêtre courte, ~25× moins de lignes que getManufacturingOrders(). */
  async getManufacturingOrdersForWindow(from: Date, to: Date): Promise<ManufacturingOrder[]> {
    return this.fetchOrders(buildWindowSql(toLocalYYYYMMDD(from), toLocalYYYYMMDD(to)))
  }

  /**
   * Complément de `getManufacturingOrdersForWindow` réservé au MATCHING commande↔OF (#99) :
   * OFs démarrés avant la fenêtre dont la production sert encore une demande de la fenêtre.
   * À n'injecter QUE dans le matcher — les faire entrer dans le pool de faisabilité créerait
   * des lignes /ruptures hors fenêtre et multiplierait les appels MFGMAT/MFGOPE (dimensionnés
   * par le nombre d'OF).
   */
  async getManufacturingOrdersForMatching(from: Date, to: Date): Promise<ManufacturingOrder[]> {
    return this.fetchOrders(buildMatchingDeltaSql(toLocalYYYYMMDD(from), toLocalYYYYMMDD(to)))
  }
}
