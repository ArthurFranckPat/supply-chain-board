import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import type { Flow, NeedNature, OrderType } from '#app/domain/models/flow'

interface OrdersSqlOptions {
  from: string
  to: string
  /** WIPTYP=5 (OFs) inclus dans la fenêtre [from, to]. */
  includeOf: boolean
  /** SORDERQ.FMINUM_0 (peg contremarque commande↔OF) — colonne coûteuse, lean par défaut. */
  includeContremarque: boolean
  /** BPCORD/CUSORDREF/ITMREFBPC (réf client) — colonne coûteuse, lean par défaut. */
  includeCustomerRef: boolean
}

// ORDERS WIPTYP=1 (demande) + WIPTYP=2 (réceptions) [+ WIPTYP=5 (OFs) si includeOf].
// Remplace 2 anciens templates quasi identiques (buildDemandReceptionSql / buildLiveSql).
// ZSOAPSQL O(n²) sur les lignes ET colonnes : les colonnes contremarque/réf client ne
// s'ajoutent que si demandées — ne jamais élargir une variante lean par défaut.
function buildOrdersSql(opts: OrdersSqlOptions): string {
  const { from, to, includeOf, includeContremarque, includeCustomerRef } = opts

  const columns = [
    'O.WIPTYP_0',
    'O.WIPSTA_0',
    'O.VCRNUM_0',
    'O.VCRLIN_0',
    'O.ITMREF_0',
    'I.ITMDES1_0   AS DESIGNATION',
    'O.ENDDAT_0',
    'O.RMNEXTQTY_0',
    'O.EXTQTY_0',
    'O.ALLQTY_0',
    'P.BPRNAM_0    AS PARTNER_NOM',
    'P.CRY_0       AS PAYS',
    'H.ORDDAT_0    AS ORDDAT',
  ]
  if (includeContremarque) columns.push('SQ.FMINUM_0   AS CONTREMARQUE')
  if (includeCustomerRef) {
    columns.push(
      'H.BPCORD_0    AS BPCORD',
      'H.CUSORDREF_0 AS CUSORDREF',
      'IB.ITMREFBPC_0 AS ITMREFBPC'
    )
  }
  columns.push(`CASE
    WHEN O.WIPSTA_0 = 1 AND O.WIPTYP_0 = 1 THEN H.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 AND P.CRY_0 IS NOT NULL AND P.CRY_0 <> 'FR' THEN 'NOR'
    ELSE NULL
  END           AS SOHTYP`)

  const joins = [
    'INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0',
    'LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0',
    'LEFT JOIN SORDER H ON H.SOHNUM_0 = O.VCRNUM_0 AND O.WIPTYP_0 = 1',
  ]
  if (includeContremarque)
    joins.push('LEFT JOIN SORDERQ SQ ON SQ.SOHNUM_0 = O.VCRNUM_0 AND SQ.SOPLIN_0 = O.VCRLIN_0')
  if (includeCustomerRef)
    joins.push('LEFT JOIN ITMBPC IB ON IB.ITMREF_0 = O.ITMREF_0 AND IB.BPCNUM_0 = H.BPCORD_0')

  const conditions = [
    `(O.WIPTYP_0 = 1 AND O.WIPSTA_0 IN (1, 3)
      AND O.ENDDAT_0 >= TO_DATE('${from}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD'))`,
    `(O.WIPTYP_0 = 2 AND O.WIPSTA_0 IN (1, 2)
      AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD'))`,
  ]
  if (includeOf) {
    conditions.push(`(O.WIPTYP_0 = 5 AND O.WIPSTA_0 IN (1, 2, 3)
      AND O.ENDDAT_0 >= TO_DATE('${from}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD'))`)
  }

  return `
SELECT
  ${columns.join(',\n  ')}
FROM ORDERS O
${joins.join('\n')}
WHERE O.WIPTYP_0 IN (${includeOf ? '1, 2, 5' : '1, 2'})
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND (
    ${conditions.join('\n    OR ')}
  )
`
}

type RawRow = Record<string, string | null>

const OF_STATUS_LABELS: Record<number, string> = { 1: 'Ferme', 2: 'Planifié', 3: 'Suggéré' }

/**
 * Client pour lequel on expose les références client (CUSORDREF + ITMREFBPC).
 * Les autres clients : les refs remontent null (non pertinent / bruit sur la table).
 * Scopé à ALDES S.A. (BPCORD 80001) — seul cas où la réf interne ≠ réf client.
 */
const CLIENTS_AVEC_REF_CLIENT = new Set(['80001'])

function toNum(v: string | null | undefined): number {
  return Number.parseFloat(v ?? '0') || 0
}

interface DemandMapOptions {
  /** Lire SORDERQ.FMINUM_0 (colonne CONTREMARQUE) — sinon toujours null. */
  contremarque: boolean
  /** Reporter DESIGNATION sur l'origin (fetchDemandAndReception uniquement). */
  designation: boolean
  /** Reporter les réfs client BPCORD/CUSORDREF/ITMREFBPC (fetchLive uniquement). */
  customerRef: boolean
}

function mapDemandRow(row: RawRow, opts: DemandMapOptions): Flow {
  const wipsta = Number.parseInt(row.WIPSTA_0 ?? '0')
  const article = row.ITMREF_0?.trim() ?? ''
  const quantity = toNum(row.RMNEXTQTY_0)
  const date = parseX3Date(row.ENDDAT_0)
  const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
  const orderType = (row.SOHTYP?.trim() || null) as OrderType | null
  const contremarque = opts.contremarque ? row.CONTREMARQUE?.trim() || null : null
  const designation = opts.designation ? (row.DESIGNATION?.trim() ?? null) : undefined
  const exposeRef = opts.customerRef && CLIENTS_AVEC_REF_CLIENT.has((row.BPCORD ?? '').trim())

  if (nature === 'COMMANDE') {
    return {
      article,
      quantity,
      direction: 'demand',
      date,
      origin: {
        type: 'order',
        id: row.VCRNUM_0?.trim() ?? '',
        customer: row.PARTNER_NOM?.trim() ?? '',
        pays: row.PAYS?.trim() ?? null,
        orderType,
        nature,
        contremarque,
        qteCommandee: toNum(row.EXTQTY_0),
        qteAllouee: toNum(row.ALLQTY_0),
        ligne: row.VCRLIN_0?.trim() ?? null,
        designation,
        refCommandeClient: opts.customerRef
          ? exposeRef
            ? row.CUSORDREF?.trim() || null
            : null
          : undefined,
        refArticleClient: opts.customerRef
          ? exposeRef
            ? row.ITMREFBPC?.trim() || null
            : null
          : undefined,
        dateCommande: parseX3Date(row.ORDDAT),
      },
    }
  }
  return {
    article,
    quantity,
    direction: 'demand',
    date,
    origin: {
      type: 'forecast',
      id: row.VCRNUM_0?.trim() ?? '',
      customer: row.PARTNER_NOM?.trim() ?? '',
      pays: row.PAYS?.trim() ?? null,
      orderType,
      contremarque,
      qteCommandee: toNum(row.EXTQTY_0),
      qteAllouee: toNum(row.ALLQTY_0),
      designation,
      dateCommande: parseX3Date(row.ORDDAT),
    },
  }
}

function mapReceptionRow(row: RawRow): Flow {
  const wipsta = Number.parseInt(row.WIPSTA_0 ?? '0')
  return {
    article: row.ITMREF_0?.trim() ?? '',
    quantity: toNum(row.RMNEXTQTY_0),
    direction: 'supply',
    date: parseX3Date(row.ENDDAT_0),
    origin: {
      type: 'reception',
      id: row.VCRNUM_0?.trim() ?? '',
      supplier: row.PARTNER_NOM?.trim() ?? '',
      designation: row.DESIGNATION?.trim() ?? null,
      categorie: null,
      dateCommande: null,
      qteCommandee: toNum(row.EXTQTY_0),
      firm: wipsta === 1,
    },
  }
}

function mapOfRow(row: RawRow): Flow {
  // H5 (audit sécu) : défaut prudent = Suggéré (3), pas Ferme (1). Un statut
  // null/0/NaN ne doit JAMAIS devenir Ferme — cela court-circuiterait les checks
  // de rupture (un OF ferme est considéré lancé, donc la matière est consommée).
  // WIPSTA valide ∈ {1, 2, 3} ; tout autre valeur → 3 (Suggéré, conservatif).
  const raw = Number.parseInt(row.WIPSTA_0 ?? '0')
  const status = (raw >= 1 && raw <= 3 ? raw : 3) as 1 | 2 | 3
  return {
    article: row.ITMREF_0?.trim() ?? '',
    quantity: toNum(row.RMNEXTQTY_0),
    direction: 'supply',
    date: parseX3Date(row.ENDDAT_0),
    origin: {
      type: 'of',
      id: row.VCRNUM_0?.trim() ?? '',
      status,
      statutLabel: OF_STATUS_LABELS[status] ?? null,
      typeOf: null,
      typeOfLabel: null,
      designation: row.DESIGNATION?.trim() ?? null,
      launched: toNum(row.EXTQTY_0),
    },
  }
}

export interface LiveOrdersResult {
  demandFlows: Flow[]
  receptionFlows: Flow[]
  ofFlows: Flow[]
}

export class CombinedOrdersRepository {
  /** Demande + réceptions sans OFs. 1 SOAP WIPTYP=1+2 — ~2-3× moins de lignes que fetchLive(). */
  async fetchDemandAndReception(
    fromIso: string,
    toIso: string
  ): Promise<{ demandFlows: Flow[]; receptionFlows: Flow[] }> {
    const from = fromIso.replace(/-/g, '')
    const to = toIso.replace(/-/g, '')
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(
        buildOrdersSql({
          from,
          to,
          includeOf: false,
          includeContremarque: true,
          includeCustomerRef: false,
        })
      )
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const receptionFlows: Flow[] = []
    const mapOpts: DemandMapOptions = { contremarque: true, designation: true, customerRef: false }

    for (const row of rows) {
      const wiptyp = Number.parseInt(row.WIPTYP_0 ?? '0')
      if (wiptyp === 1) demandFlows.push(mapDemandRow(row, mapOpts))
      else if (wiptyp === 2) receptionFlows.push(mapReceptionRow(row))
    }

    return { demandFlows, receptionFlows }
  }

  /** 1 SOAP (ORDERS WIPTYP=1+2+5) → demande scopée [from,to] + réceptions attendues ≤ to + OFs fenêtre.
   * Remplace X3BesoinClientRepository.getDemandFlows() + X3ReceptionRepository.getReceptionFlows().
   *
   * Contremarque INCLUSE (pas lean) : sans elle, le matcher (proactif + suivi réactif, qui
   * passent par getLive) perd tous les pegs commande↔OF et retombe sur l'heuristique
   * article+date → deux commandes peggées chacune sur SON OF se disputent le même
   * (racing, faux « sans couverture » — cas AR2603112/AR2603144 ↔ F426-40274/40278).
   * Coût : 1 colonne + 1 LEFT JOIN SORDERQ qui ne matche que les lignes WIPTYP=1. */
  async fetchLive(fromIso: string, toIso: string): Promise<LiveOrdersResult> {
    const from = fromIso.replace(/-/g, '')
    const to = toIso.replace(/-/g, '')
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(
        buildOrdersSql({
          from,
          to,
          includeOf: true,
          includeContremarque: true,
          includeCustomerRef: true,
        })
      )
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const receptionFlows: Flow[] = []
    const ofFlows: Flow[] = []
    const mapOpts: DemandMapOptions = { contremarque: true, designation: false, customerRef: true }

    for (const row of rows) {
      const wiptyp = Number.parseInt(row.WIPTYP_0 ?? '0')
      if (wiptyp === 5) ofFlows.push(mapOfRow(row))
      else if (wiptyp === 1) demandFlows.push(mapDemandRow(row, mapOpts))
      else if (wiptyp === 2) receptionFlows.push(mapReceptionRow(row))
    }

    return { demandFlows, receptionFlows, ofFlows }
  }

  /** Flux futurs d'UN article — projection de stock de la sheet détail du KPI
   *  stock (stock_detail_loader). Quatre natures :
   *   - `demande` : lignes client à livrer (WIPTYP 1, fermes WIPSTA 1 +
   *     prévisions WIPSTA 3, ENDDAT ∈ [from, to]) — les articles vendus.
   *   - `composant` : besoin matière des OF ouverts (MFGMAT restant à sortir,
   *     OF fermes/planifiés démarrant ≤ to, datés STRDAT) — la demande réelle
   *     des articles achetés/semi-finis, absente de WIPTYP 1.
   *   - `reception` : réceptions attendues (WIPTYP 2, WIPSTA 1/2, ENDDAT ≤ to).
   *   - `of` : production attendue des OF ouverts (WIPTYP 5, WIPSTA 1/2,
   *     ENDDAT ∈ [from, to]).
   *
   *  Même sémantique de fenêtre que buildOrdersSql, mais scopée à l'article :
   *  le fetch global toutes fenêtres confondues dépasse le seuil de lignes du
   *  SOAP Syracuse (resultXml is nil) sur un horizon 12 mois — ici chaque
   *  résultat tient toujours en une poignée de lignes. */
  async fetchArticleFutureFlows(
    article: string,
    fromIso: string,
    toIso: string
  ): Promise<Array<{ kind: 'demande' | 'composant' | 'reception' | 'of'; date: Date | null; qty: number }>> {
    const from = fromIso.replace(/-/g, '')
    const to = toIso.replace(/-/g, '')
    const itmr = article.replace(/'/g, "''")
    const db = new X3Database()
    let rows: RawRow[] = []
    let matRows: RawRow[] = []
    try {
      rows = await db.raw(`
SELECT O.WIPTYP_0, O.ENDDAT_0, O.RMNEXTQTY_0
FROM ORDERS O
WHERE O.ITMREF_0 = '${itmr}'
  AND O.RMNEXTQTY_0 > 0
  AND (
    (O.WIPTYP_0 = 1 AND O.WIPSTA_0 IN (1, 3)
      AND O.ENDDAT_0 >= TO_DATE('${from}','YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${to}','YYYYMMDD'))
    OR (O.WIPTYP_0 = 2 AND O.WIPSTA_0 IN (1, 2)
      AND O.ENDDAT_0 <= TO_DATE('${to}','YYYYMMDD'))
    OR (O.WIPTYP_0 = 5 AND O.WIPSTA_0 IN (1, 2)
      AND O.ENDDAT_0 >= TO_DATE('${from}','YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${to}','YYYYMMDD'))
  )`)
      // Besoin composant : pas de borne basse sur STRDAT — un OF démarré avant
      // la fenêtre dont la matière n'est pas encore sortie reste un besoin à
      // venir (le loader le clampe dans son premier seau, comme les retards).
      matRows = await db.raw(`
SELECT O.STRDAT_0 AS STRDAT, (M.RETQTY_0 - M.USEQTY_0) AS QTY
FROM MFGMAT M
INNER JOIN ORDERS O ON O.VCRNUM_0 = M.MFGNUM_0 AND O.WIPTYP_0 = 5
WHERE M.ITMREF_0 = '${itmr}'
  AND (M.RETQTY_0 - M.USEQTY_0) > 0
  AND O.WIPSTA_0 IN (1, 2)
  AND O.STRDAT_0 <= TO_DATE('${to}','YYYYMMDD')`)
    } finally {
      await db.destroy()
    }

    const out: Array<{ kind: 'demande' | 'composant' | 'reception' | 'of'; date: Date | null; qty: number }> = []
    for (const row of rows) {
      const wiptyp = Number.parseInt(row.WIPTYP_0 ?? '0')
      const qty = Number.parseFloat(row.RMNEXTQTY_0 ?? '0') || 0
      if (qty <= 0) continue
      const kind = wiptyp === 1 ? 'demande' : wiptyp === 2 ? 'reception' : 'of'
      out.push({ kind, date: parseX3Date(row.ENDDAT_0), qty })
    }
    for (const row of matRows) {
      const qty = Number.parseFloat(row.QTY ?? '0') || 0
      if (qty <= 0) continue
      out.push({ kind: 'composant', date: parseX3Date(row.STRDAT), qty })
    }
    return out
  }
}
