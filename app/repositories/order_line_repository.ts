import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import { SQL_RESTE_A_FABRIQUER } from '#app/domain/models/orders_qty'
import type { OrderType, NeedNature } from '#app/domain/models/flow'

/**
 * Issue #10 — Mode planification : lignes de commande ouvertes au niveau ligne.
 * Calque de X3BesoinClientRepository (qui jette VCRLIN_0) en sélectionnant
 * O.VCRLIN_0 (clé SOPLIN_0) pour identifiant unique (numCommande, ligne).
 * Filtre `RESTE_LIVRER > 0` et `WIPTYP_0=1` (commandes).
 *
 * Expose aussi le type commande (SOHTYP_0 : MTS/MTO/NOR) et la nature
 * (WIPSTA_0 : 1=COMMANDE / 3=PREVISION) pour les filtres du board.
 */
// CLIENT = vrai client de la ligne (BPARTNER sur O.BPRNUM_0). Pour les prévisions
// (WIPSTA=3), BPRNUM_0 est null → CLIENT vide (une prévision n'a pas de client métier).
// On ne colmate PLUS de fallback via ITMBPC (l'ancien P_LINK inventait un client par
// défaut sur les prévisions — comportement trompeur, supprimé).
const SQL = `
SELECT
  O.VCRNUM_0  AS NO_COMMANDE,
  O.VCRLIN_0  AS LIGNE,
  P.BPRNAM_0  AS CLIENT,
  O.ITMREF_0  AS ARTICLE,
  I.ITMDES1_0 AS DESIGNATION,
  Q.FMINUM_0  AS CONTREMARQUE,
  O.WIPSTA_0  AS WIPSTA,
  CASE WHEN O.WIPSTA_0 = 1 THEN H_CUR.SOHTYP_0 ELSE NULL END AS SOHTYP,
  CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END AS ECHEANCE,
  ${SQL_RESTE_A_FABRIQUER} AS RESTE_LIVRER,
  I.STU_0     AS UNITE
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H_CUR ON H_CUR.SOHNUM_0 = O.VCRNUM_0
LEFT JOIN SORDERQ Q ON Q.SOHNUM_0 = O.VCRNUM_0 AND Q.SOPLIN_0 = O.VCRLIN_0
WHERE O.WIPTYP_0 = 1
  AND I.ITMSTA_0 = 1
  AND ${SQL_RESTE_A_FABRIQUER} > 0
`

type RawRow = Record<string, string | null>

const ISO = /^\d{4}-\d{2}-\d{2}$/

export interface OrderLineRow {
  numCommande: string
  ligne: string
  client: string | null
  article: string
  designation: string | null
  quantite: number
  dateLivraison: Date
  contremarque: string | null
  unite: string | null
  orderType: OrderType | null
  nature: NeedNature
}

/**
 * Ligne telle qu'INGÉRÉE dans la tranche WIPTYP=1 d'`orders_flux_replica` :
 * `OrderLineRow` plus les trois quantités brutes d'`ORDERS`. `quantite` (reste à
 * fabriquer) en est dérivée et reste écrite pour les appelants existants — mais
 * elle ne se décompose pas, d'où les trois colonnes supplémentaires.
 */
export interface OrderLineReplicaSourceRow extends OrderLineRow {
  /** `RMNEXTQTY_0` — reliquat brut, allocations comprises. */
  qteRestante: number
  /** `EXTQTY_0` — quantité commandée d'origine. */
  qteCommandee: number
  /** `ALLQTY_0` — part déjà allouée depuis le stock. */
  qteAllouee: number
}

/**
 * Ligne de demande servant la projection de charge (ORDERS WIPTYP=1). Volontairement
 * distinct d'`OrderLineRow` : `clientCode` est le CODE tiers brut, pas la raison
 * sociale — la résolution du nom coûte une jointure BPARTNER, faite à la demande.
 */
export interface OrderLineForLoad {
  article: string
  designation: string | null
  quantite: number
  dateLivraison: Date
  nature: NeedNature
  /** Commande client (WIPSTA=1) ou identifiant de prévision (WIPSTA=3). */
  numCommande: string | null
  ligne: string | null
  /** Code tiers X3 ; null sur une prévision (pas de client). */
  clientCode: string | null
}

/** Lien inverse OF → commande cliente, via la contremarque X3 (SORDERQ.FMINUM_0). */
export interface OfCommandePeg {
  numCommande: string
  client: string | null
  dateExpedition: Date | null
}

const PEG_SQL = `
SELECT
  Q.FMINUM_0 AS OF_NUM,
  Q.SOHNUM_0 AS NO_COMMANDE,
  Q.SHIDAT_0 AS ECHEANCE,
  P.BPRNAM_0 AS CLIENT
FROM SORDERQ Q
LEFT JOIN SORDER H ON H.SOHNUM_0 = Q.SOHNUM_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = H.BPCORD_0
WHERE Q.FMINUM_0 IN (__IN__)
`

export class X3OrderLineRepository {
  /**
   * Reverse peg : pour une liste de numéros d'OF, résout la commande cliente rattachée via
   * la contremarque (SORDERQ.FMINUM_0 = n° OF). Indépendant de l'échéance — permet d'attribuer
   * sa commande à un OF fabriqué dans la fenêtre alors que la commande expédie plus tard
   * (cf. F426-32355 ↔ AR2601963). Un OF peut peg plusieurs lignes : on garde la plus urgente.
   */
  async getCommandesByOf(ofNums: string[]): Promise<Map<string, OfCommandePeg>> {
    const all = await this.getAllCommandesByOf(ofNums)
    const out = new Map<string, OfCommandePeg>()
    for (const [ofNum, pegs] of all) if (pegs[0]) out.set(ofNum, pegs[0])
    return out
  }

  /**
   * Variante N-N du reverse peg : TOUTES les commandes rattachées à chaque OF,
   * triées par urgence (date d'expédition la plus tôt d'abord, nulls en dernier).
   * Panneau « Engagement » par poste (#46) — un OF peut alimenter plusieurs lignes.
   */
  async getAllCommandesByOf(ofNums: string[]): Promise<Map<string, OfCommandePeg[]>> {
    const unique = [...new Set(ofNums.map((n) => n.trim()).filter(Boolean))]
    const out = new Map<string, OfCommandePeg[]>()
    if (unique.length === 0) return out

    const db = new X3Database()
    try {
      // Chunk pour rester sous la limite IN (1000) d'Oracle.
      for (let i = 0; i < unique.length; i += 1000) {
        const chunk = unique.slice(i, i + 1000)
        const inList = chunk.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
        const rows: RawRow[] = await db.raw(PEG_SQL.replace('__IN__', inList))
        for (const row of rows) {
          const ofNum = row.OF_NUM?.trim()
          const numCommande = row.NO_COMMANDE?.trim()
          if (!ofNum || !numCommande) continue
          const list = out.get(ofNum) ?? []
          const dateExpedition = parseX3Date(row.ECHEANCE)
          // Dédoublonne : plusieurs lignes SORDERQ d'une même commande → 1 entrée,
          // date d'expédition la plus tôt conservée.
          const existing = list.find((p) => p.numCommande === numCommande)
          if (existing) {
            const a = existing.dateExpedition?.getTime() ?? Infinity
            const b = dateExpedition?.getTime() ?? Infinity
            if (b < a) existing.dateExpedition = dateExpedition
          } else {
            list.push({ numCommande, client: row.CLIENT?.trim() || null, dateExpedition })
          }
          out.set(ofNum, list)
        }
      }
      for (const list of out.values()) {
        list.sort(
          (a, b) =>
            (a.dateExpedition?.getTime() ?? Infinity) - (b.dateExpedition?.getTime() ?? Infinity)
        )
      }
      return out
    } finally {
      await db.destroy()
    }
  }

  /**
   * Une ligne de commande ouverte précise (numCommande, ligne) — sans borne d'échéance.
   * Pour le panneau de détail (issue planification). Renvoie null si introuvable/livrée.
   */
  async getOrderLine(numCommande: string, ligne: string): Promise<OrderLineRow | null> {
    const esc = (s: string) => s.replace(/'/g, "''")
    const sql = SQL + `\n  AND O.VCRNUM_0 = '${esc(numCommande)}' AND O.VCRLIN_0 = '${esc(ligne)}'`

    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const row = rows[0]
      if (!row) return null
      const date = parseX3Date(row.ECHEANCE)
      if (!date) return null
      const rawType = row.SOHTYP?.trim() ?? ''
      const orderType: OrderType | null = rawType === '' ? null : (rawType as OrderType)
      const nature: NeedNature = row.WIPSTA?.trim() === '1' ? 'COMMANDE' : 'PREVISION'
      return {
        numCommande: row.NO_COMMANDE?.trim() ?? '',
        ligne: row.LIGNE?.trim() ?? '',
        client: row.CLIENT?.trim() || null,
        article: row.ARTICLE?.trim() ?? '',
        designation: row.DESIGNATION?.trim() || null,
        quantite: Number.parseFloat(row.RESTE_LIVRER ?? '0') || 0,
        dateLivraison: date,
        contremarque: row.CONTREMARQUE?.trim() || null,
        unite: row.UNITE?.trim() || null,
        orderType,
        nature,
      }
    } finally {
      await db.destroy()
    }
  }

  /**
   * Charge /charge uniquement : 8 cols, 1 JOIN (ITMMASTER) au lieu de 11 cols + 5 JOINs.
   * Supprime BPARTNER×2, SORDER, SORDERQ, ITMBPC sous-requête — tous inutiles pour la vue charge.
   * Utilise ENDDAT_0 pour ECHEANCE (vs CASE WHEN SHIDAT_0/ENDDAT_0) : delta négligeable
   * sur un horizon 6 mois en mailles hebdo/mensuel.
   *
   * VCRNUM/VCRLIN/BPRNUM portent la PROVENANCE, propagée jusqu'aux composants
   * par l'explosion (cf. ChargeSource) pour le détail de charge. Ce sont 3
   * colonnes de la table déjà lue, sans JOIN supplémentaire : le nom du client
   * est délibérément NON résolu ici — rejoindre BPARTNER remettrait la jointure
   * retirée pour la perf (#39), sur la totalité de l'horizon alors que seul le
   * bucket cliqué en a besoin. Cf. `resolveClientNames`.
   *
   * RESTE_LIVRER passe par `SQL_RESTE_A_FABRIQUER` comme la const `SQL`
   * ci-dessus — cf. l'invariant ORDERS dans `domain/models/orders_qty.ts`.
   */
  async getOrderLinesForLoad(fromStr: string, toStr: string): Promise<OrderLineForLoad[]> {
    const sql = `
SELECT
  O.ITMREF_0    AS ARTICLE,
  I.ITMDES1_0   AS DESIGNATION,
  O.WIPSTA_0    AS WIPSTA,
  O.ENDDAT_0    AS ECHEANCE,
  ${SQL_RESTE_A_FABRIQUER} AS RESTE_LIVRER,
  O.VCRNUM_0    AS NO_DOCUMENT,
  O.VCRLIN_0    AS LIGNE,
  O.BPRNUM_0    AS CODE_CLIENT
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
WHERE O.WIPTYP_0 = 1
  AND I.ITMSTA_0 = 1
  AND ${SQL_RESTE_A_FABRIQUER} > 0
  AND O.WIPSTA_0 IN (1, 3)
  AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
  AND O.ENDDAT_0 <= TO_DATE('${toStr}', 'YYYYMMDD')
`
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      return rows
        .map((row) => {
          const date = parseX3Date(row.ECHEANCE)
          if (!date) return null
          const ligne = row.LIGNE?.trim() ?? ''
          return {
            article: row.ARTICLE?.trim() ?? '',
            designation: row.DESIGNATION?.trim() || null,
            quantite: Number.parseFloat(row.RESTE_LIVRER ?? '0') || 0,
            dateLivraison: date,
            nature: (row.WIPSTA?.trim() === '1' ? 'COMMANDE' : 'PREVISION') as NeedNature,
            numCommande: row.NO_DOCUMENT?.trim() || null,
            // Une prévision porte VCRLIN_0 = 0 : pas de ligne, pas un « 0 » à afficher.
            ligne: ligne && ligne !== '0' ? ligne : null,
            clientCode: row.CODE_CLIENT?.trim() || null,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    } finally {
      await db.destroy()
    }
  }

  /**
   * Code tiers → raison sociale, pour un petit lot de codes (détail d'un bucket
   * de charge). Volontairement à la demande : la vue /charge agrégée n'affiche
   * aucun client, elle n'a pas à payer la jointure BPARTNER.
   */
  async resolveClientNames(codes: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    const clean = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
    if (clean.length === 0) return out
    const inList = clean.map((c) => `'${c.replace(/'/g, "''")}'`).join(',')
    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(
        `SELECT BPRNUM_0, BPRNAM_0 FROM BPARTNER WHERE BPRNUM_0 IN (${inList})`
      )
      for (const row of rows) {
        const code = row.BPRNUM_0?.trim()
        const name = row.BPRNAM_0?.trim()
        if (code && name) out.set(code, name)
      }
      return out
    } finally {
      await db.destroy()
    }
  }

  /**
   * Lignes de commande ouvertes (RESTE_LIVRER > 0), niveau ligne.
   * `from`/`to` optionnels : borne par ECHEANCE (SHIDAT_0 firmes / ENDDAT_0 prévisions).
   */
  /**
   * Population d'INGESTION de la tranche WIPTYP=1 d'`orders_flux_replica` (#98) —
   * plus large que `getOpenOrderLines()`, et avec les trois quantités brutes.
   *
   * Deux écarts délibérés avec la vue ci-dessous, tous deux nécessaires pour que
   * la réplique puisse servir plus d'un appelant :
   *
   *  - **filtre `RMNEXTQTY_0 > 0` au lieu de `resteAFabriquer > 0`.** Une ligne
   *    entièrement allouée (`RMNEXTQTY_0 = ALLQTY_0`) a un reste à fabriquer nul :
   *    invisible pour la vue planification, mais dans le périmètre de
   *    `RetardRepository`, qui déduit lui-même le stock alloué. L'ingérer et
   *    laisser chaque lecteur filtrer est la seule façon de servir les deux.
   *  - **les trois quantités séparément.** `quantite` (reste à fabriquer) reste
   *    écrite pour les appelants existants, mais elle ne se décompose pas : un
   *    lecteur qui a besoin d'`ALLQTY_0` ne peut pas la retrouver.
   *
   * Ne PAS la substituer à `getOpenOrderLines()` côté écrans : elle rend des
   * lignes à besoin nul que la vue planification exclut à raison.
   */
  async getOrderLinesForReplica(window: {
    from: string
    to: string
  }): Promise<OrderLineReplicaSourceRow[]> {
    if (!ISO.test(window.from) || !ISO.test(window.to)) {
      throw new Error(`Fenêtre d'ingestion invalide : ${window.from} → ${window.to} (attendu ISO)`)
    }

    // `SQL` filtre `resteAFabriquer > 0` ; on reconstruit la requête avec le
    // filtre large plutôt que de paramétrer `SQL`, qui est partagé par
    // `getOrderLine()` et doit garder exactement sa sémantique.
    const sql =
      `${SQL.replace(`AND ${SQL_RESTE_A_FABRIQUER} > 0`, 'AND O.RMNEXTQTY_0 > 0')}`.replace(
        '  O.WIPSTA_0  AS WIPSTA,',
        '  O.WIPSTA_0  AS WIPSTA,\n  O.RMNEXTQTY_0 AS QTE_RESTANTE,\n  O.EXTQTY_0 AS QTE_COMMANDEE,\n  O.ALLQTY_0 AS QTE_ALLOUEE,'
      ) +
      // BORNE TEMPORELLE — même expression d'échéance que
      // `getOpenOrderLines({from,to})`, donc même population.
      //
      // Sans elle, l'ingestion tirait TOUTES les lignes ouvertes alors que la voie
      // directe est toujours bornée (`board_dataset.getOpenOrderLines` exige
      // `from`/`to`). Contre PROD ça n'aboutit jamais : `ZSOAPSQL` (O(n²)) dépasse
      // les 120 s de `--max-time` sans avoir rendu un seul octet. Répliquer « tout »
      // quand personne ne lit « tout » était l'erreur de conception.
      `\n  AND (CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END)` +
      ` BETWEEN TO_DATE('${window.from}', 'YYYY-MM-DD') AND TO_DATE('${window.to}', 'YYYY-MM-DD')`

    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const out: OrderLineReplicaSourceRow[] = []
      for (const row of rows) {
        const date = parseX3Date(row.ECHEANCE)
        if (!date) continue
        const rawType = row.SOHTYP?.trim() ?? ''
        const num = (v: string | null | undefined) => Number.parseFloat(v ?? '0') || 0
        out.push({
          numCommande: row.NO_COMMANDE?.trim() ?? '',
          ligne: row.LIGNE?.trim() ?? '',
          client: row.CLIENT?.trim() || null,
          article: row.ARTICLE?.trim() ?? '',
          designation: row.DESIGNATION?.trim() || null,
          quantite: num(row.RESTE_LIVRER),
          dateLivraison: date,
          contremarque: row.CONTREMARQUE?.trim() || null,
          unite: row.UNITE?.trim() || null,
          orderType: rawType === '' ? null : (rawType as OrderType),
          nature: row.WIPSTA?.trim() === '1' ? 'COMMANDE' : 'PREVISION',
          qteRestante: num(row.QTE_RESTANTE),
          qteCommandee: num(row.QTE_COMMANDEE),
          qteAllouee: num(row.QTE_ALLOUEE),
        })
      }
      return out
    } finally {
      await db.destroy()
    }
  }

  async getOpenOrderLines(opts?: { from?: string; to?: string }): Promise<OrderLineRow[]> {
    let sql = SQL
    if (opts?.from && opts?.to && ISO.test(opts.from) && ISO.test(opts.to)) {
      sql +=
        `\n  AND (CASE WHEN O.WIPSTA_0 = 1 THEN Q.SHIDAT_0 ELSE O.ENDDAT_0 END)` +
        ` BETWEEN TO_DATE('${opts.from}', 'YYYY-MM-DD') AND TO_DATE('${opts.to}', 'YYYY-MM-DD')`
    }

    const db = new X3Database()
    try {
      const rows: RawRow[] = await db.raw(sql)
      const out: OrderLineRow[] = []
      for (const row of rows) {
        const date = parseX3Date(row.ECHEANCE)
        if (!date) continue
        const rawType = row.SOHTYP?.trim() ?? ''
        const orderType: OrderType | null = rawType === '' ? null : (rawType as OrderType)
        const nature: NeedNature = row.WIPSTA?.trim() === '1' ? 'COMMANDE' : 'PREVISION'
        out.push({
          numCommande: row.NO_COMMANDE?.trim() ?? '',
          ligne: row.LIGNE?.trim() ?? '',
          client: row.CLIENT?.trim() || null,
          article: row.ARTICLE?.trim() ?? '',
          designation: row.DESIGNATION?.trim() || null,
          quantite: Number.parseFloat(row.RESTE_LIVRER ?? '0') || 0,
          dateLivraison: date,
          contremarque: row.CONTREMARQUE?.trim() || null,
          unite: row.UNITE?.trim() || null,
          orderType,
          nature,
        })
      }
      return out
    } finally {
      await db.destroy()
    }
  }
}
