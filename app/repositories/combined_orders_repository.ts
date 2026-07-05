import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import type { Flow, NeedNature, OrderType } from '#app/domain/models/flow'

// ORDERS WIPTYP_0=1 seulement (commandes ventes), borné par date.
// Utilisé par SuiviService.loadRaw() qui récupère les OF via boardDataset.getOrders() (cache SWR).
// Séparation intentionnelle : WIPTYP=5 sans borne = des milliers de lignes → O(n²) ZSOAPSQL.
const buildDemandOnlySql = (fromStr: string) => `
SELECT
  O.WIPTYP_0,
  O.WIPSTA_0,
  O.VCRNUM_0,
  O.VCRLIN_0,
  O.ITMREF_0,
  I.ITMDES1_0   AS DESIGNATION,
  O.ENDDAT_0,
  O.RMNEXTQTY_0,
  O.EXTQTY_0,
  O.ALLQTY_0,
  P.BPRNAM_0    AS PARTNER_NOM,
  P.CRY_0       AS PAYS,
  CASE
    WHEN O.WIPSTA_0 = 1 THEN H.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 AND P.CRY_0 IS NOT NULL AND P.CRY_0 <> 'FR' THEN 'NOR'
    ELSE NULL
  END           AS SOHTYP
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H ON H.SOHNUM_0 = O.VCRNUM_0
WHERE O.WIPTYP_0 = 1
  AND O.WIPSTA_0 IN (1, 3)
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
`

// ORDERS WIPTYP_0=1 (commandes ventes) + WIPTYP_0=5 (OF fabrication) en 1 SQL.
// Gardé pour rétrocompatibilité — NE PAS utiliser sur des chemins chauds :
// WIPTYP=5 sans borne = O(n²) ZSOAPSQL → timeout 120s sur grandes fenêtres.
const buildSql = (fromStr: string) => `
SELECT
  O.WIPTYP_0,
  O.WIPSTA_0,
  O.VCRNUM_0,
  O.VCRLIN_0,
  O.ITMREF_0,
  I.ITMDES1_0   AS DESIGNATION,
  O.ENDDAT_0,
  O.RMNEXTQTY_0,
  O.EXTQTY_0,
  O.ALLQTY_0,
  P.BPRNAM_0    AS PARTNER_NOM,
  P.CRY_0       AS PAYS,
  CASE
    WHEN O.WIPSTA_0 = 1 AND O.WIPTYP_0 = 1 THEN H.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 AND P.CRY_0 IS NOT NULL AND P.CRY_0 <> 'FR' THEN 'NOR'
    ELSE NULL
  END           AS SOHTYP
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H ON H.SOHNUM_0 = O.VCRNUM_0 AND O.WIPTYP_0 = 1
WHERE O.WIPTYP_0 IN (1, 5)
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND (
    (O.WIPTYP_0 = 1 AND O.WIPSTA_0 IN (1, 3)
      AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD'))
    OR (O.WIPTYP_0 = 5 AND O.WIPSTA_0 IN (1, 2, 3))
  )
`

// Demande (WIPTYP=1) + réceptions (WIPTYP=2) seulement — sans les OFs (WIPTYP=5).
// Remplace getLive() quand les OFs sont déjà chargés via getOrdersForWindow().
// ZSOAPSQL O(n²) : ~2-3× moins de lignes → requête ~4-9× plus rapide.
const buildDemandReceptionSql = (fromStr: string, toStr: string) => `
SELECT
  O.WIPTYP_0,
  O.WIPSTA_0,
  O.VCRNUM_0,
  O.VCRLIN_0,
  O.ITMREF_0,
  I.ITMDES1_0   AS DESIGNATION,
  O.ENDDAT_0,
  O.RMNEXTQTY_0,
  O.EXTQTY_0,
  O.ALLQTY_0,
  P.BPRNAM_0    AS PARTNER_NOM,
  P.CRY_0       AS PAYS,
  SQ.FMINUM_0   AS CONTREMARQUE,
  CASE
    WHEN O.WIPSTA_0 = 1 AND O.WIPTYP_0 = 1 THEN H.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 AND P.CRY_0 IS NOT NULL AND P.CRY_0 <> 'FR' THEN 'NOR'
    ELSE NULL
  END           AS SOHTYP
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H ON H.SOHNUM_0 = O.VCRNUM_0 AND O.WIPTYP_0 = 1
LEFT JOIN SORDERQ SQ ON SQ.SOHNUM_0 = O.VCRNUM_0 AND SQ.SOPLIN_0 = O.VCRLIN_0
WHERE O.WIPTYP_0 IN (1, 2)
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND (
    (O.WIPTYP_0 = 1 AND O.WIPSTA_0 IN (1, 3)
      AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD'))
    OR (O.WIPTYP_0 = 2 AND O.WIPSTA_0 IN (1, 2)
      AND O.ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD'))
  )
`

// WIPTYP=1 (demande) + WIPTYP=2 (réceptions) + WIPTYP=5 (OFs fenêtre) en 1 SOAP.
// Remplace getOrders() + getLive() (2 SOAP) pour la vue proactive et loadOrderImpacts.
// OFs bornés par [from, to] : seuls les OF de la fenêtre sont nécessaires (loadOrderImpacts
// filtre déjà en mémoire f.date >= windowFrom && f.date <= windowTo).
const buildLiveSql = (fromStr: string, toStr: string) => `
SELECT
  O.WIPTYP_0,
  O.WIPSTA_0,
  O.VCRNUM_0,
  O.VCRLIN_0,
  O.ITMREF_0,
  I.ITMDES1_0   AS DESIGNATION,
  O.ENDDAT_0,
  O.RMNEXTQTY_0,
  O.EXTQTY_0,
  O.ALLQTY_0,
  P.BPRNAM_0    AS PARTNER_NOM,
  P.CRY_0       AS PAYS,
  H.BPCORD_0    AS BPCORD,
  H.CUSORDREF_0 AS CUSORDREF,
  IB.ITMREFBPC_0 AS ITMREFBPC,
  CASE
    WHEN O.WIPSTA_0 = 1 AND O.WIPTYP_0 = 1 THEN H.SOHTYP_0
    WHEN O.WIPSTA_0 = 3 AND P.CRY_0 IS NOT NULL AND P.CRY_0 <> 'FR' THEN 'NOR'
    ELSE NULL
  END           AS SOHTYP
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H ON H.SOHNUM_0 = O.VCRNUM_0 AND O.WIPTYP_0 = 1
LEFT JOIN ITMBPC IB ON IB.ITMREF_0 = O.ITMREF_0 AND IB.BPCNUM_0 = H.BPCORD_0
WHERE O.WIPTYP_0 IN (1, 2, 5)
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND (
    (O.WIPTYP_0 = 1 AND O.WIPSTA_0 IN (1, 3)
      AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD'))
    OR (O.WIPTYP_0 = 2 AND O.WIPSTA_0 IN (1, 2)
      AND O.ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD'))
    OR (O.WIPTYP_0 = 5 AND O.WIPSTA_0 IN (1, 2, 3)
      AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD'))
  )
`

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

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

export interface CombinedOrdersResult {
  demandFlows: Flow[]
  ofFlows: Flow[]
}

export interface LiveOrdersResult {
  demandFlows: Flow[]
  receptionFlows: Flow[]
  ofFlows: Flow[]
}

export class CombinedOrdersRepository {
  /** SOAP demand-only (WIPTYP=1, borné). Utilisé par SuiviService.loadRaw(). */
  async fetchDemandOnly(from: Date): Promise<Flow[]> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildDemandOnlySql(toYYYYMMDD(from)))
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    for (const row of rows) {
      const wipsta = parseInt(row.WIPSTA_0 ?? '0')
      const article = row.ITMREF_0?.trim() ?? ''
      const qty = toNum(row.RMNEXTQTY_0)
      const date = parseX3Date(row.ENDDAT_0)
      const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
      const rawType = row.SOHTYP?.trim() || null
      const orderType = rawType as OrderType | null

      if (nature === 'COMMANDE') {
        demandFlows.push({
          article, quantity: qty, direction: 'demand', date,
          origin: {
            type: 'order',
            id: row.VCRNUM_0?.trim() ?? '',
            customer: row.PARTNER_NOM?.trim() ?? '',
            pays: row.PAYS?.trim() ?? null,
            orderType, nature,
            contremarque: null,
            qteCommandee: toNum(row.EXTQTY_0),
            qteAllouee: toNum(row.ALLQTY_0),
            ligne: row.VCRLIN_0?.trim() ?? null,
          },
        })
      } else {
        demandFlows.push({
          article, quantity: qty, direction: 'demand', date,
          origin: {
            type: 'forecast',
            id: row.VCRNUM_0?.trim() ?? '',
            customer: row.PARTNER_NOM?.trim() || null,
            pays: row.PAYS?.trim() ?? null,
            orderType,
            contremarque: null,
            qteCommandee: toNum(row.EXTQTY_0),
            qteAllouee: toNum(row.ALLQTY_0),
          },
        })
      }
    }
    return demandFlows
  }

  async fetch(from: Date): Promise<CombinedOrdersResult> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildSql(toYYYYMMDD(from)))
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const ofFlows: Flow[] = []

    for (const row of rows) {
      const wiptyp = parseInt(row.WIPTYP_0 ?? '0')
      const wipsta = parseInt(row.WIPSTA_0 ?? '0')
      const article = row.ITMREF_0?.trim() ?? ''
      const qty = toNum(row.RMNEXTQTY_0)
      const date = parseX3Date(row.ENDDAT_0)

      if (wiptyp === 1) {
        const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
        const rawType = row.SOHTYP?.trim() || null
        const orderType = rawType as OrderType | null

        if (nature === 'COMMANDE') {
          demandFlows.push({
            article,
            quantity: qty,
            direction: 'demand',
            date,
            origin: {
              type: 'order',
              id: row.VCRNUM_0?.trim() ?? '',
              customer: row.PARTNER_NOM?.trim() ?? '',
              pays: row.PAYS?.trim() ?? null,
              orderType,
              nature,
              contremarque: null,
              qteCommandee: toNum(row.EXTQTY_0),
              qteAllouee: toNum(row.ALLQTY_0),
              ligne: row.VCRLIN_0?.trim() ?? null,
            },
          })
        } else {
          demandFlows.push({
            article,
            quantity: qty,
            direction: 'demand',
            date,
            origin: {
              type: 'forecast',
              id: row.VCRNUM_0?.trim() ?? '',
              customer: row.PARTNER_NOM?.trim() || null,
              pays: row.PAYS?.trim() ?? null,
              orderType,
              contremarque: null,
              qteCommandee: toNum(row.EXTQTY_0),
              qteAllouee: toNum(row.ALLQTY_0),
            },
          })
        }
      } else if (wiptyp === 5) {
        const status = wipsta as 1 | 2 | 3
        ofFlows.push({
          article,
          quantity: qty,
          direction: 'supply',
          date,
          origin: {
            type: 'of',
            id: row.VCRNUM_0?.trim() ?? '',
            status,
            statutLabel: OF_STATUS_LABELS[status] ?? null,
            typeOf: null,
            typeOfLabel: null,
            designation: row.DESIGNATION?.trim() ?? null,
          },
        })
      }
    }

    return { demandFlows, ofFlows }
  }

  /** Demande + réceptions sans OFs. 1 SOAP WIPTYP=1+2 — ~2-3× moins de lignes que fetchLive(). */
  async fetchDemandAndReception(fromIso: string, toIso: string): Promise<{ demandFlows: Flow[]; receptionFlows: Flow[] }> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildDemandReceptionSql(fromIso.replace(/-/g, ''), toIso.replace(/-/g, '')))
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const receptionFlows: Flow[] = []

    for (const row of rows) {
      const wiptyp = parseInt(row.WIPTYP_0 ?? '0')
      const wipsta = parseInt(row.WIPSTA_0 ?? '0')
      const article = row.ITMREF_0?.trim() ?? ''
      const qty = toNum(row.RMNEXTQTY_0)
      const date = parseX3Date(row.ENDDAT_0)

      if (wiptyp === 1) {
        const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
        const rawType = row.SOHTYP?.trim() || null
        const orderType = rawType as OrderType | null
        if (nature === 'COMMANDE') {
          demandFlows.push({
            article, quantity: qty, direction: 'demand', date,
            origin: {
              type: 'order',
              id: row.VCRNUM_0?.trim() ?? '',
              customer: row.PARTNER_NOM?.trim() ?? '',
              pays: row.PAYS?.trim() ?? null,
              orderType, nature,
              contremarque: row.CONTREMARQUE?.trim() || null,
              qteCommandee: toNum(row.EXTQTY_0),
              qteAllouee: toNum(row.ALLQTY_0),
              ligne: row.VCRLIN_0?.trim() ?? null,
              designation: row.DESIGNATION?.trim() ?? null,
            },
          })
        } else {
          demandFlows.push({
            article, quantity: qty, direction: 'demand', date,
            origin: {
              type: 'forecast',
              id: row.VCRNUM_0?.trim() ?? '',
              customer: row.PARTNER_NOM?.trim() || null,
              pays: row.PAYS?.trim() ?? null,
              orderType,
              contremarque: row.CONTREMARQUE?.trim() || null,
              qteCommandee: toNum(row.EXTQTY_0),
              qteAllouee: toNum(row.ALLQTY_0),
              designation: row.DESIGNATION?.trim() ?? null,
            },
          })
        }
      } else if (wiptyp === 2) {
        receptionFlows.push({
          article, quantity: qty, direction: 'supply', date,
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
        })
      }
    }

    return { demandFlows, receptionFlows }
  }

  /** 1 SOAP (ORDERS WIPTYP=1+2) → demande scopée [from,to] + réceptions attendues ≤ to.
   * Remplace X3BesoinClientRepository.getDemandFlows() + X3ReceptionRepository.getReceptionFlows(). */
  async fetchLive(fromIso: string, toIso: string): Promise<LiveOrdersResult> {
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildLiveSql(fromIso.replace(/-/g, ''), toIso.replace(/-/g, '')))
    } finally {
      await db.destroy()
    }

    const demandFlows: Flow[] = []
    const receptionFlows: Flow[] = []
    const ofFlows: Flow[] = []

    for (const row of rows) {
      const wiptyp = parseInt(row.WIPTYP_0 ?? '0')
      const wipsta = parseInt(row.WIPSTA_0 ?? '0')
      const article = row.ITMREF_0?.trim() ?? ''
      const qty = toNum(row.RMNEXTQTY_0)
      const date = parseX3Date(row.ENDDAT_0)

      if (wiptyp === 5) {
        const status = wipsta as 1 | 2 | 3
        ofFlows.push({
          article, quantity: qty, direction: 'supply', date,
          origin: {
            type: 'of',
            id: row.VCRNUM_0?.trim() ?? '',
            status,
            statutLabel: OF_STATUS_LABELS[status] ?? null,
            typeOf: null,
            typeOfLabel: null,
            designation: row.DESIGNATION?.trim() ?? null,
          },
        })
      } else if (wiptyp === 1) {
        const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
        const rawType = row.SOHTYP?.trim() || null
        const orderType = rawType as OrderType | null

        if (nature === 'COMMANDE') {
          // Références client scopées à ALDES S.A. (80001) — null pour les autres clients.
          const exposeRef = CLIENTS_AVEC_REF_CLIENT.has((row.BPCORD ?? '').trim())
          demandFlows.push({
            article,
            quantity: qty,
            direction: 'demand',
            date,
            origin: {
              type: 'order',
              id: row.VCRNUM_0?.trim() ?? '',
              customer: row.PARTNER_NOM?.trim() ?? '',
              pays: row.PAYS?.trim() ?? null,
              orderType,
              nature,
              contremarque: null,
              qteCommandee: toNum(row.EXTQTY_0),
              qteAllouee: toNum(row.ALLQTY_0),
              ligne: row.VCRLIN_0?.trim() ?? null,
              refCommandeClient: exposeRef ? (row.CUSORDREF?.trim() || null) : null,
              refArticleClient: exposeRef ? (row.ITMREFBPC?.trim() || null) : null,
            },
          })
        } else {
          demandFlows.push({
            article,
            quantity: qty,
            direction: 'demand',
            date,
            origin: {
              type: 'forecast',
              id: row.VCRNUM_0?.trim() ?? '',
              customer: row.PARTNER_NOM?.trim() || null,
              pays: row.PAYS?.trim() ?? null,
              orderType,
              contremarque: null,
              qteCommandee: toNum(row.EXTQTY_0),
              qteAllouee: toNum(row.ALLQTY_0),
            },
          })
        }
      } else if (wiptyp === 2) {
        receptionFlows.push({
          article,
          quantity: qty,
          direction: 'supply',
          date,
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
        })
      }
    }

    return { demandFlows, receptionFlows, ofFlows }
  }
}
