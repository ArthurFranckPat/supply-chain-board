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
  /** Restreint à UN `WIPTYP` — ingestion partitionnée (`fetchForReplica`). */
  onlyWiptyp?: 1 | 2 | 5
  /**
   * Avancement de production (`CPLQTY_0`, `STRDAT_0`) et population d'INGESTION
   * plutôt que population de `fetchLive`.
   *
   * `fetchLive` n'a jamais eu besoin de l'avancement d'un OF ni des OF au-delà de
   * sa fenêtre. `orders_replica`, que cette table absorbe, a besoin des deux :
   * le board affiche lancé/réalisé/restant et `getManufacturingOrders()` ne pose
   * AUCUNE borne haute sur `ENDDAT_0`.
   *
   * D'où le drapeau : on ingère la population la plus LARGE que demande un
   * lecteur, et chaque lecteur reborne ensuite. Sans lui, consolider ferait
   * disparaître du board les OF dont la fin dépasse l'horizon d'un an.
   */
  forReplica?: boolean
  /**
   * Ré-ingestion CIBLÉE (read-after-write, #98) : l'identité remplace la fenêtre.
   *
   * Les bornes `ENDDAT_0` sautent — un ordre qu'on vient d'écrire dans X3 peut
   * échoir n'importe quand, et le relire hors de sa fenêtre est justement ce qui
   * referme la fenêtre sale sans attendre le swap complet. Les WIPSTA, eux, ne
   * bougent pas : la ré-ingestion doit porter sur la MÊME population que le swap,
   * sinon elle réécrit des lignes que le run complet effacerait aussitôt.
   */
  vcrnums?: string[]
}

/**
 * Statuts retenus par `WIPTYP`, déclarés UNE fois.
 *
 * La fenêtre (`conditionByWiptyp`) et la ré-ingestion ciblée (`vcrnums`) doivent
 * porter sur la même population. Recopier ces listes à deux endroits les ferait
 * diverger au premier ajustement — c'est la classe de bug qui a produit la
 * régression `getOrdersForWindow` du lot 2.
 */
const WIPSTA_BY_WIPTYP: Record<1 | 2 | 5, readonly number[]> = {
  1: [1, 3],
  2: [1, 2],
  5: [1, 2, 3],
}

/** Littéral SQL d'une liste de `VCRNUM_0`. Quote doublée, comme
 *  `getManufacturingOrdersByNums` — pas de quote dans la valeur, pas d'injection. */
function sqlList(values: string[]): string {
  return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')
}

// ORDERS WIPTYP=1 (demande) + WIPTYP=2 (réceptions) [+ WIPTYP=5 (OFs) si includeOf].
// Remplace 2 anciens templates quasi identiques (buildDemandReceptionSql / buildLiveSql).
// ZSOAPSQL O(n²) sur les lignes ET colonnes : les colonnes contremarque/réf client ne
// s'ajoutent que si demandées — ne jamais élargir une variante lean par défaut.
export function buildOrdersSql(opts: OrdersSqlOptions): string {
  const {
    from,
    to,
    includeOf,
    includeContremarque,
    includeCustomerRef,
    onlyWiptyp,
    forReplica,
    vcrnums,
  } = opts

  const columns = [
    'O.WIPTYP_0',
    'O.WIPSTA_0',
    'O.VCRNUM_0',
    'O.VCRLIN_0',
    // 4ᵉ composante de l'identité d'une ligne. Une commande ouverte porte
    // plusieurs échéances sur la MÊME ligne : `COA2400006` ligne 1 en a six, de
    // 20 000 chacune. Sans `VCRSEQ_0`, toute réplique clé sur (WIPTYP, VCRNUM,
    // VCRLIN) les écraserait en une seule et perdrait 100 000 unités d'appro.
    // Inoffensive pour les appelants X3 directs, qui ne dédoublonnent pas.
    'O.VCRSEQ_0',
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
  // Avancement de production : deux colonnes de plus dans un SQL en O(n²) sur les
  // colonnes, donc jamais par défaut — seule l'ingestion les demande, une fois par
  // tick, pour que le board n'ait plus sa propre table.
  if (forReplica) columns.push('O.CPLQTY_0', 'O.STRDAT_0', 'O.STOFCY_0', 'O.BPRNUM_0')
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

  // Une condition par WIPTYP, indexée par WIPTYP : `onlyWiptyp` en garde UNE et
  // n'en réécrit AUCUNE. C'est ce qui garantit qu'une ingestion partitionnée
  // rend exactement la même population que l'appel groupé, tranche par tranche.
  const sta = (w: 1 | 2 | 5) => `O.WIPSTA_0 IN (${WIPSTA_BY_WIPTYP[w].join(', ')})`

  const conditionByWiptyp: Record<1 | 2 | 5, string> = vcrnums
    ? {
        // Ré-ingestion ciblée : l'identité seule, sans borne de dates. Voir
        // `OrdersSqlOptions.vcrnums`.
        1: `(O.WIPTYP_0 = 1 AND ${sta(1)} AND O.VCRNUM_0 IN (${sqlList(vcrnums)}))`,
        2: `(O.WIPTYP_0 = 2 AND ${sta(2)} AND O.VCRNUM_0 IN (${sqlList(vcrnums)}))`,
        5: `(O.WIPTYP_0 = 5 AND ${sta(5)} AND O.VCRNUM_0 IN (${sqlList(vcrnums)}))`,
      }
    : {
        1: `(O.WIPTYP_0 = 1 AND ${sta(1)}
      AND O.ENDDAT_0 >= TO_DATE('${from}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD'))`,
        2: `(O.WIPTYP_0 = 2 AND ${sta(2)}
      AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD'))`,
        // Borne haute LEVÉE à l'ingestion : `getManufacturingOrders()`, que cette
        // table absorbe, n'en pose aucune. La reborner ici ferait disparaître du
        // board les OF dont la fin dépasse l'horizon d'un an. `getLiveRows()`
        // rapplique la fenêtre à la lecture, donc `fetchLive` ne change pas.
        5: forReplica
          ? `(O.WIPTYP_0 = 5 AND ${sta(5)}
      AND O.ENDDAT_0 >= TO_DATE('${from}', 'YYYYMMDD'))`
          : `(O.WIPTYP_0 = 5 AND ${sta(5)}
      AND O.ENDDAT_0 >= TO_DATE('${from}', 'YYYYMMDD')
      AND O.ENDDAT_0 <= TO_DATE('${to}', 'YYYYMMDD'))`,
      }

  const wiptyps: Array<1 | 2 | 5> = onlyWiptyp ? [onlyWiptyp] : includeOf ? [1, 2, 5] : [1, 2]
  const conditions = wiptyps.map((w) => conditionByWiptyp[w])

  return `
SELECT
  ${columns.join(',\n  ')}
FROM ORDERS O
${joins.join('\n')}
WHERE O.WIPTYP_0 IN (${wiptyps.join(', ')})
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

/**
 * Une ligne d'`ORDERS` NORMALISÉE, jointures comprises — indépendante de sa
 * provenance (SOAP X3 ou `orders_flux_replica`).
 *
 * Les trois mappers ci-dessous travaillaient sur les `RawRow` bruts d'X3
 * (`row.RMNEXTQTY_0` en string, `parseX3Date(row.ENDDAT_0)`). Y brancher la
 * réplique aurait imposé de refabriquer de faux `RawRow` : `parseX3Date`
 * n'accepte que `dd-MMM-yy`, donc reformater une date déjà parsée pour la
 * reparser aussitôt — et perdre le siècle au passage (année sur 2 chiffres).
 * Même motif que `RetardLine` dans `retard_repository`.
 *
 * `vcrseq` n'était lue par personne avant la réplique. Elle est pourtant la
 * 4ᵉ composante de l'identité d'une ligne : `COA2400006` ligne 1 porte SIX
 * échéances de 20 000 (WIPTYP=2, commande ouverte), que seul `VCRSEQ_0`
 * distingue. Vérifié en PROD : `(WIPTYP, VCRNUM, VCRLIN, VCRSEQ)` n'a aucun
 * doublon sur l'ensemble d'`ORDERS`, `(WIPTYP, VCRNUM, VCRLIN)` en a.
 */
export interface OrdersSourceRow {
  wiptyp: number
  wipsta: number
  vcrnum: string
  vcrlin: string | null
  vcrseq: string | null
  article: string
  designation: string | null
  /** `ENDDAT_0` — échéance. */
  date: Date | null
  /** `RMNEXTQTY_0` — reste à livrer/produire. */
  qteRestante: number
  /** `EXTQTY_0`. */
  qteCommandee: number
  /** `ALLQTY_0`. */
  qteAllouee: number
  partnerNom: string | null
  pays: string | null
  /** `SORDER.ORDDAT_0` — date de commande. */
  dateCommande: Date | null
  /** `SORDERQ.FMINUM_0` — peg contremarque commande↔OF. */
  contremarque: string | null
  bpcord: string | null
  cusordref: string | null
  itmrefbpc: string | null
  /** Colonne CALCULÉE côté SQL (CASE sur WIPSTA/WIPTYP/pays), pas un champ X3. */
  sohtyp: string | null
  /** `CPLQTY_0` — quantité RÉALISÉE d'un OF. Seule l'ingestion la demande
   *  (`forReplica`) ; `undefined` sur les lectures `fetchLive`. */
  qteRealisee?: number
  /** `STRDAT_0` — date de LANCEMENT d'un OF, distincte de l'échéance. */
  dateDebut?: Date | null
  /** `STOFCY_0` — site. Seule l'ingestion la demande (`forReplica`), pour la
   *  résolution des clés d'affermissement (#31, #105). */
  stofcy?: string | null
  /** `BPRNUM_0` — code tiers brut de la ligne. Seule l'ingestion la demande
   *  (`forReplica`), pour la vue /charge (`OrderLineForLoad.clientCode`). */
  bprnum?: string | null
}

/** `RawRow` X3 → ligne normalisée. Seul point où le format X3 est interprété. */
export function toOrdersSourceRow(row: RawRow): OrdersSourceRow {
  return {
    wiptyp: Number.parseInt(row.WIPTYP_0 ?? '0'),
    wipsta: Number.parseInt(row.WIPSTA_0 ?? '0'),
    vcrnum: row.VCRNUM_0?.trim() ?? '',
    vcrlin: row.VCRLIN_0?.trim() || null,
    vcrseq: row.VCRSEQ_0?.trim() || null,
    article: row.ITMREF_0?.trim() ?? '',
    designation: row.DESIGNATION?.trim() || null,
    date: parseX3Date(row.ENDDAT_0),
    qteRestante: toNum(row.RMNEXTQTY_0),
    qteCommandee: toNum(row.EXTQTY_0),
    qteAllouee: toNum(row.ALLQTY_0),
    partnerNom: row.PARTNER_NOM?.trim() || null,
    pays: row.PAYS?.trim() || null,
    dateCommande: parseX3Date(row.ORDDAT),
    contremarque: row.CONTREMARQUE?.trim() || null,
    bpcord: row.BPCORD?.trim() || null,
    cusordref: row.CUSORDREF?.trim() || null,
    itmrefbpc: row.ITMREFBPC?.trim() || null,
    sohtyp: row.SOHTYP?.trim() || null,
    // Absentes des variantes non-`forReplica` : `undefined` et non 0/null, pour
    // que « colonne non demandée » reste distinct de « valeur nulle ».
    qteRealisee: row.CPLQTY_0 === undefined ? undefined : toNum(row.CPLQTY_0),
    dateDebut: row.STRDAT_0 === undefined ? undefined : parseX3Date(row.STRDAT_0),
    stofcy: row.STOFCY_0 === undefined ? undefined : row.STOFCY_0?.trim() || null,
    bprnum: row.BPRNUM_0 === undefined ? undefined : row.BPRNUM_0?.trim() || null,
  }
}

/**
 * Options de mise en forme de `fetchLive` — extraites en constante parce que la
 * voie réplique DOIT les partager. Deux littéraux recopiés finiraient par
 * diverger (une réf client exposée d'un côté, pas de l'autre), et rien ne le
 * signalerait : les deux voies rendent des `Flow` bien formés.
 */
export const LIVE_MAP_OPTS: DemandMapOptions = {
  contremarque: true,
  designation: false,
  customerRef: true,
}

interface DemandMapOptions {
  /** Lire SORDERQ.FMINUM_0 (colonne CONTREMARQUE) — sinon toujours null. */
  contremarque: boolean
  /** Reporter DESIGNATION sur l'origin (fetchDemandAndReception uniquement). */
  designation: boolean
  /** Reporter les réfs client BPCORD/CUSORDREF/ITMREFBPC (fetchLive uniquement). */
  customerRef: boolean
}

function mapDemandRow(row: OrdersSourceRow, opts: DemandMapOptions): Flow {
  const wipsta = row.wipsta
  const article = row.article
  const quantity = row.qteRestante
  const date = row.date
  const nature: NeedNature = wipsta === 3 ? 'PREVISION' : 'COMMANDE'
  const orderType = row.sohtyp as OrderType | null
  const contremarque = opts.contremarque ? row.contremarque : null
  const designation = opts.designation ? row.designation : undefined
  const exposeRef = opts.customerRef && CLIENTS_AVEC_REF_CLIENT.has(row.bpcord ?? '')

  if (nature === 'COMMANDE') {
    return {
      article,
      quantity,
      direction: 'demand',
      date,
      origin: {
        type: 'order',
        id: row.vcrnum,
        customer: row.partnerNom ?? '',
        pays: row.pays,
        orderType,
        nature,
        contremarque,
        qteCommandee: row.qteCommandee,
        qteAllouee: row.qteAllouee,
        ligne: row.vcrlin,
        designation,
        refCommandeClient: opts.customerRef ? (exposeRef ? row.cusordref : null) : undefined,
        refArticleClient: opts.customerRef ? (exposeRef ? row.itmrefbpc : null) : undefined,
        dateCommande: row.dateCommande,
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
      id: row.vcrnum,
      customer: row.partnerNom ?? '',
      pays: row.pays,
      orderType,
      contremarque,
      qteCommandee: row.qteCommandee,
      qteAllouee: row.qteAllouee,
      designation,
      dateCommande: row.dateCommande,
    },
  }
}

function mapReceptionRow(row: OrdersSourceRow): Flow {
  return {
    article: row.article,
    quantity: row.qteRestante,
    direction: 'supply',
    date: row.date,
    origin: {
      type: 'reception',
      id: row.vcrnum,
      supplier: row.partnerNom ?? '',
      designation: row.designation,
      categorie: null,
      dateCommande: null,
      qteCommandee: row.qteCommandee,
      firm: row.wipsta === 1,
    },
  }
}

function mapOfRow(row: OrdersSourceRow): Flow {
  // H5 (audit sécu) : défaut prudent = Suggéré (3), pas Ferme (1). Un statut
  // null/0/NaN ne doit JAMAIS devenir Ferme — cela court-circuiterait les checks
  // de rupture (un OF ferme est considéré lancé, donc la matière est consommée).
  // WIPSTA valide ∈ {1, 2, 3} ; tout autre valeur → 3 (Suggéré, conservatif).
  const raw = row.wipsta
  const status = (raw >= 1 && raw <= 3 ? raw : 3) as 1 | 2 | 3
  return {
    article: row.article,
    quantity: row.qteRestante,
    direction: 'supply',
    date: row.date,
    origin: {
      type: 'of',
      id: row.vcrnum,
      status,
      statutLabel: OF_STATUS_LABELS[status] ?? null,
      typeOf: null,
      typeOfLabel: null,
      designation: row.designation,
      launched: row.qteCommandee,
    },
  }
}

/**
 * Éclate des lignes normalisées en trois familles de `Flow`, par `WIPTYP`.
 *
 * Partagée par les deux voies — X3 direct et réplique — pour que la bascule ne
 * puisse pas faire diverger la mise en forme. C'est le pendant lecture du
 * principe d'ingestion : une seule règle, un seul endroit.
 */
export function splitOrdersFlows(
  rows: OrdersSourceRow[],
  opts: DemandMapOptions
): LiveOrdersResult {
  const demandFlows: Flow[] = []
  const receptionFlows: Flow[] = []
  const ofFlows: Flow[] = []
  for (const row of rows) {
    if (row.wiptyp === 5) ofFlows.push(mapOfRow(row))
    else if (row.wiptyp === 1) demandFlows.push(mapDemandRow(row, opts))
    else if (row.wiptyp === 2) receptionFlows.push(mapReceptionRow(row))
  }
  return { demandFlows, receptionFlows, ofFlows }
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

    const { demandFlows, receptionFlows } = splitOrdersFlows(rows.map(toOrdersSourceRow), {
      contremarque: true,
      designation: true,
      customerRef: false,
    })
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

    return splitOrdersFlows(rows.map(toOrdersSourceRow), LIVE_MAP_OPTS)
  }

  /**
   * Population d'INGESTION d'`orders_flux_replica`, UN `WIPTYP` à la fois.
   *
   * Le découpage par `WIPTYP` n'est pas un filtre de consommateur — c'est une
   * PARTITION de la source : les trois passes réunies rendent exactement ce que
   * `fetchLive` demande en un appel, rien de moins.
   *
   * Pourquoi partitionner plutôt qu'un seul appel : `ZSOAPSQL` est en O(n²) sur
   * les lignes ET les colonnes (issue #40, append CLOB). Découper est donc moins
   * cher que regrouper, à l'inverse de l'intuition habituelle. Mesuré en PROD
   * sur la fenêtre −90 j/+1 an : 9 208 (WIPTYP 1) + 895 (2) + 13 536 (5) =
   * 23 639 lignes. En un seul appel, 23 639² ≈ 2× le coût de la somme des
   * carrés — et la variante grasse ajoute 4 colonnes et 3 jointures par-dessus.
   * Le constat était déjà posé lors du travail perf sur `/suivi` : ne pas
   * combiner WIPTYP=1+5.
   *
   * Variante GRASSE assumée (contremarque + réfs client). Elle est coûteuse par
   * appel, mais ici elle est payée une fois par tick d'ingestion au lieu d'une
   * fois par chargement de page — c'est exactement l'échange que fait une
   * réplique. Sans la contremarque, le matcher perd les pegs commande↔OF et
   * retombe sur l'heuristique article+date (cf. `fetchLive`).
   */
  async fetchForReplica(
    fromIso: string,
    toIso: string,
    wiptyp: 1 | 2 | 5
  ): Promise<OrdersSourceRow[]> {
    const from = fromIso.replace(/-/g, '')
    const to = toIso.replace(/-/g, '')
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(
        buildOrdersSql({
          from,
          to,
          includeOf: true,
          includeContremarque: true,
          includeCustomerRef: true,
          onlyWiptyp: wiptyp,
          forReplica: true,
        })
      )
      return rows.map(toOrdersSourceRow)
    } finally {
      await db.destroy()
    }
  }

  /**
   * Ré-ingestion CIBLÉE d'`orders_flux_replica` : les OF nommés, sans fenêtre
   * (#98, read-after-write).
   *
   * Même SQL, mêmes colonnes grasses et même mapper que `fetchForReplica` — donc
   * les lignes réécrites après une écriture X3 sont IDENTIQUES à celles qu'un
   * swap complet produirait. Une variante plus maigre (le `getManufacturingOrders`
   * historique, par exemple) reviendrait à vider la contremarque et les réfs
   * client des OF qu'on vient d'affermir : le matcher OF↔commande retomberait sur
   * l'heuristique article+date pour eux seuls, jusqu'au prochain run complet.
   *
   * `WIPTYP=5` seul : une écriture d'affermissement consomme une suggestion et
   * crée un OF, les deux dans cette partition. Aucun chemin d'écriture du projet
   * ne touche les WIPTYP 1 ou 2 aujourd'hui.
   *
   * Découpage à 200, comme `getManufacturingOrdersByNums` : un `IN` trop long
   * fait ressortir `ZSOAPSQL` avec un `resultXml` vide (issue #40) plutôt qu'une
   * erreur SQL.
   */
  async fetchForReplicaByNums(numOfs: string[]): Promise<OrdersSourceRow[]> {
    const uniq = [...new Set(numOfs.map((n) => n.trim()).filter(Boolean))]
    if (uniq.length === 0) return []

    const CHUNK = 200
    const db = new X3Database()
    try {
      const out: OrdersSourceRow[] = []
      for (let i = 0; i < uniq.length; i += CHUNK) {
        const rows: RawRow[] = await db.raw(
          buildOrdersSql({
            // Sans objet quand `vcrnums` est posé : les bornes de dates ne sont
            // pas rendues. Gardées non vides pour le typage seul.
            from: '',
            to: '',
            includeOf: true,
            includeContremarque: true,
            includeCustomerRef: true,
            onlyWiptyp: 5,
            forReplica: true,
            vcrnums: uniq.slice(i, i + CHUNK),
          })
        )
        out.push(...rows.map(toOrdersSourceRow))
      }
      return out
    } finally {
      await db.destroy()
    }
  }

  /** Flux futurs d'UN article — projection de stock de la sheet détail du KPI
   *  stock (stock_detail_loader). Quatre natures, toutes lues sur ORDERS, qui
   *  est le carnet complet des besoins ET des ressources :
   *   - `demande`   : WIPTYP 1 — lignes client à livrer.
   *   - `composant` : WIPTYP 6 — **besoin matière**, la nature native d'ORDERS
   *     pour la matière consommée par la fabrication.
   *   - `reception` : WIPTYP 2 — réceptions achat attendues.
   *   - `of`        : WIPTYP 5 — production attendue.
   *
   *  **WIPTYP 6 remplace l'ancien passage par MFGMAT** (issue #88). Les deux
   *  disent la même chose pour les OF fermes — vérifié ligne à ligne sur
   *  `11022900` : MFGMAT `F426-28058` RETQTY 320 − USEQTY 198 = 122, et ORDERS
   *  WIPTYP 6 WIPSTA 1 `F426-28058` RMNEXTQTY = 122 — mais MFGMAT s'arrête aux
   *  OF matérialisés. Le besoin matière des **suggestions CBN** (WIPSTA 3)
   *  n'existe que dans ORDERS, et c'est l'essentiel du volume : sur
   *  `11022900`, 531 en ferme contre 183 820 en suggéré sur l'horizon. Passer
   *  par MFGMAT amputait donc la projection de ~99 % de ses besoins.
   *
   *  **Statuts (WIPSTA) : 1 Ferme + 2 Planifié + 3 Suggéré, seul 4 Clos est
   *  exclu — et ce uniformément sur les quatre natures.** Le site tourne à
   *  100 % CBN : les suggestions SONT le plan. Les compter d'un côté et pas de
   *  l'autre déséquilibre la projection par construction. Avec la règle
   *  uniforme, `11022900` sort 186 401 de besoins face à 184 800 de
   *  ressources — l'équilibre attendu d'un CBN, et la signature d'une lecture
   *  correcte de la table.
   *
   *  **Dates : borne haute seule.** Un flux en retard (ENDDAT passée,
   *  RMNEXTQTY toujours > 0) reste à passer : le loader le clampe dans son
   *  premier seau. Une borne basse le ferait disparaître de la projection tout
   *  en le laissant peser sur le stock réel.
   *
   *  Une seule requête, scopée à l'article : le fetch global toutes fenêtres
   *  confondues dépasse le seuil de lignes du SOAP Syracuse (resultXml is nil)
   *  sur un horizon 12 mois. ZSOAPSQL étant O(n²) sur les lignes ET les
   *  colonnes, ne jamais élargir cette projection au-delà de ses 3 colonnes. */
  async fetchArticleFutureFlows(
    article: string,
    _fromIso: string,
    toIso: string
  ): Promise<
    Array<{ kind: 'demande' | 'composant' | 'reception' | 'of'; date: Date | null; qty: number }>
  > {
    const to = toIso.replace(/-/g, '')
    const itmr = article.replace(/'/g, "''")
    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(`
SELECT O.WIPTYP_0, O.ENDDAT_0, O.RMNEXTQTY_0
FROM ORDERS O
WHERE O.ITMREF_0 = '${itmr}'
  AND O.RMNEXTQTY_0 > 0
  AND O.WIPTYP_0 IN (1, 2, 5, 6)
  AND O.WIPSTA_0 IN (1, 2, 3)
  AND O.ENDDAT_0 <= TO_DATE('${to}','YYYYMMDD')`)
    } finally {
      await db.destroy()
    }

    const KIND_BY_WIPTYP: Record<number, 'demande' | 'composant' | 'reception' | 'of'> = {
      1: 'demande',
      2: 'reception',
      5: 'of',
      6: 'composant',
    }

    const out: Array<{
      kind: 'demande' | 'composant' | 'reception' | 'of'
      date: Date | null
      qty: number
    }> = []
    for (const row of rows) {
      const kind = KIND_BY_WIPTYP[Number.parseInt(row.WIPTYP_0 ?? '0')]
      if (!kind) continue
      const qty = Number.parseFloat(row.RMNEXTQTY_0 ?? '0') || 0
      if (qty <= 0) continue
      out.push({ kind, date: parseX3Date(row.ENDDAT_0), qty })
    }
    return out
  }
}
