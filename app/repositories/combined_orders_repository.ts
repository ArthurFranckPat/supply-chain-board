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
  ]
  if (includeContremarque) columns.push('SQ.FMINUM_0   AS CONTREMARQUE')
  if (includeCustomerRef) {
    columns.push('H.BPCORD_0    AS BPCORD', 'H.CUSORDREF_0 AS CUSORDREF', 'IB.ITMREFBPC_0 AS ITMREFBPC')
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
  if (includeContremarque) joins.push('LEFT JOIN SORDERQ SQ ON SQ.SOHNUM_0 = O.VCRNUM_0 AND SQ.SOPLIN_0 = O.VCRLIN_0')
  if (includeCustomerRef) joins.push('LEFT JOIN ITMBPC IB ON IB.ITMREF_0 = O.ITMREF_0 AND IB.BPCNUM_0 = H.BPCORD_0')

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
  return parseFloat(v ?? '0') || 0
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
  const wipsta = parseInt(row.WIPSTA_0 ?? '0')
  const article = row.ITMREF_0?.trim() ?? ''
  const quantity = toNum(row.RMNEXTQTY_0)
  const date = parseX3Date(row.ENDDAT_0)
  const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
  const orderType = (row.SOHTYP?.trim() || null) as OrderType | null
  const contremarque = opts.contremarque ? row.CONTREMARQUE?.trim() || null : null
  const designation = opts.designation ? row.DESIGNATION?.trim() ?? null : undefined
  const exposeRef = opts.customerRef && CLIENTS_AVEC_REF_CLIENT.has((row.BPCORD ?? '').trim())

  if (nature === 'COMMANDE') {
    return {
      article, quantity, direction: 'demand', date,
      origin: {
        type: 'order',
        id: row.VCRNUM_0?.trim() ?? '',
        customer: row.PARTNER_NOM?.trim() ?? '',
        pays: row.PAYS?.trim() ?? null,
        orderType, nature, contremarque,
        qteCommandee: toNum(row.EXTQTY_0),
        qteAllouee: toNum(row.ALLQTY_0),
        ligne: row.VCRLIN_0?.trim() ?? null,
        designation,
        refCommandeClient: opts.customerRef ? (exposeRef ? row.CUSORDREF?.trim() || null : null) : undefined,
        refArticleClient: opts.customerRef ? (exposeRef ? row.ITMREFBPC?.trim() || null : null) : undefined,
      },
    }
  }
  return {
    article, quantity, direction: 'demand', date,
    origin: {
      type: 'forecast',
      id: row.VCRNUM_0?.trim() ?? '',
      customer: row.PARTNER_NOM?.trim() || null,
      pays: row.PAYS?.trim() ?? null,
      orderType, contremarque,
      qteCommandee: toNum(row.EXTQTY_0),
      qteAllouee: toNum(row.ALLQTY_0),
      designation,
    },
  }
}

function mapReceptionRow(row: RawRow): Flow {
  const wipsta = parseInt(row.WIPSTA_0 ?? '0')
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
  const status = (parseInt(row.WIPSTA_0 ?? '0') || 1) as 1 | 2 | 3
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
  async fetchDemandAndReception(fromIso: string, toIso: string): Promise<{ demandFlows: Flow[]; receptionFlows: Flow[] }> {
    const from = fromIso.replace(/-/g, '')
    const to = toIso.replace(/-/g, '')
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildOrdersSql({ from, to, includeOf: false, includeContremarque: true, includeCustomerRef: false }))
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const receptionFlows: Flow[] = []
    const mapOpts: DemandMapOptions = { contremarque: true, designation: true, customerRef: false }

    for (const row of rows) {
      const wiptyp = parseInt(row.WIPTYP_0 ?? '0')
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
      rows = await db.raw(buildOrdersSql({ from, to, includeOf: true, includeContremarque: true, includeCustomerRef: true }))
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const receptionFlows: Flow[] = []
    const ofFlows: Flow[] = []
    const mapOpts: DemandMapOptions = { contremarque: true, designation: false, customerRef: true }

    for (const row of rows) {
      const wiptyp = parseInt(row.WIPTYP_0 ?? '0')
      if (wiptyp === 5) ofFlows.push(mapOfRow(row))
      else if (wiptyp === 1) demandFlows.push(mapDemandRow(row, mapOpts))
      else if (wiptyp === 2) receptionFlows.push(mapReceptionRow(row))
    }

    return { demandFlows, receptionFlows, ofFlows }
  }
}
