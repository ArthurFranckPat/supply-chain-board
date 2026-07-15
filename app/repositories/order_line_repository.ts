import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
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
  (O.RMNEXTQTY_0 - O.ALLQTY_0) AS RESTE_LIVRER,
  I.STU_0     AS UNITE
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H_CUR ON H_CUR.SOHNUM_0 = O.VCRNUM_0
LEFT JOIN SORDERQ Q ON Q.SOHNUM_0 = O.VCRNUM_0 AND Q.SOPLIN_0 = O.VCRLIN_0
WHERE O.WIPTYP_0 = 1
  AND I.ITMSTA_0 = 1
  AND (O.RMNEXTQTY_0 - O.ALLQTY_0) > 0
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
   * Charge /charge uniquement : 5 cols, 1 JOIN (ITMMASTER) au lieu de 11 cols + 5 JOINs.
   * Supprime BPARTNER×2, SORDER, SORDERQ, ITMBPC sous-requête — tous inutiles pour la vue charge.
   * Utilise ENDDAT_0 pour ECHEANCE (vs CASE WHEN SHIDAT_0/ENDDAT_0) : delta négligeable
   * sur un horizon 6 mois en mailles hebdo/mensuel.
   */
  async getOrderLinesForLoad(
    fromStr: string,
    toStr: string
  ): Promise<
    Pick<OrderLineRow, 'article' | 'designation' | 'quantite' | 'dateLivraison' | 'nature'>[]
  > {
    const sql = `
SELECT
  O.ITMREF_0    AS ARTICLE,
  I.ITMDES1_0   AS DESIGNATION,
  O.WIPSTA_0    AS WIPSTA,
  O.ENDDAT_0    AS ECHEANCE,
  O.RMNEXTQTY_0 AS RESTE_LIVRER
FROM ORDERS O
JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
WHERE O.WIPTYP_0 = 1
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
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
          return {
            article: row.ARTICLE?.trim() ?? '',
            designation: row.DESIGNATION?.trim() || null,
            quantite: Number.parseFloat(row.RESTE_LIVRER ?? '0') || 0,
            dateLivraison: date,
            nature: (row.WIPSTA?.trim() === '1' ? 'COMMANDE' : 'PREVISION') as NeedNature,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
    } finally {
      await db.destroy()
    }
  }

  /**
   * Lignes de commande ouvertes (RESTE_LIVRER > 0), niveau ligne.
   * `from`/`to` optionnels : borne par ECHEANCE (SHIDAT_0 firmes / ENDDAT_0 prévisions).
   */
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
