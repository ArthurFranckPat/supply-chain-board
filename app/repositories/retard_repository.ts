import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import boardDataset from '#services/board_dataset'
import { CommandeOFMatcher } from '#app/domain/of-conso'
import type { Flow, OrderType } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'

// ORDERS WIPTYP=1 (commandes vente) WIPSTA=1 (confirmées).
// ENDDAT_0 = date expé = SHIDAT_0 pour les commandes confirmées.
// RMNEXTQTY_0 = EXTQTY_0 - DLVQTY_0 calculé par X3.
// CONTREMARQUE (SORDERQ.FMINUM_0) + SOHTYP (SORDER.SOHTYP_0, type MTS/MTO/NOR) :
// alimentent CommandeOFMatcher (of-conso.ts) — même matching OF↔commande que le
// board/panneau engagement, pas une heuristique maison.
const buildSql = (fromStr: string, toStr: string) => `
SELECT
  O.VCRNUM_0    AS SOHNUM,
  O.VCRLIN_0    AS LIGNE,
  P.BPRNAM_0    AS CLIENT,
  O.ITMREF_0    AS ARTICLE,
  I.ITMDES1_0   AS DESIGNATION,
  O.ENDDAT_0    AS DATE_EXP,
  O.RMNEXTQTY_0 AS QTE_RESTANTE,
  O.ALLQTY_0    AS QTE_ALLOUEE,
  Q.FMINUM_0    AS CONTREMARQUE,
  H.SOHTYP_0    AS SOHTYP
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
LEFT JOIN SORDER H ON H.SOHNUM_0 = O.VCRNUM_0
LEFT JOIN SORDERQ Q ON Q.SOHNUM_0 = O.VCRNUM_0 AND Q.SOPLIN_0 = O.VCRLIN_0
WHERE O.WIPTYP_0 = 1
  AND O.WIPSTA_0 = 1
  AND I.ITMSTA_0 = 1
  AND O.RMNEXTQTY_0 > 0
  AND O.ENDDAT_0 >= TO_DATE('${fromStr}', 'YYYYMMDD')
  AND O.ENDDAT_0 < TO_DATE('${toStr}', 'YYYYMMDD')
ORDER BY O.ENDDAT_0
`

// Stock disponible non alloué (PHYSTO - PHYALL - GLOALL), tous sites, par article.
// Sert à exclure du retard de PRODUCTION les lignes déjà couvertes par du stock
// fabriqué mais pas encore alloué à la commande (cf. issue stock non alloué).
const buildStockSql = (articles: string[]) => `
SELECT
  ITMREF_0 AS ARTICLE,
  SUM(PHYSTO_0 - PHYALL_0 - GLOALL_0) AS QTE_DISPO
FROM ITMMVT
WHERE ITMREF_0 IN (${articles.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')})
GROUP BY ITMREF_0
`

// Temps opératoire réellement déclaré par OF (réglage + opératoire, en heures — TIMUOMCOD_0
// "Heures" sur ce site). Se met à jour à chaque déclaration d'opération, contrairement à
// CPLQTY_0 (ORDERS/OF) qui n'avance qu'à la déclaration finale (entrée stock) — capte
// l'avancement réel des OF longs avant leur clôture.
const buildOpTimeSql = (mfgnums: string[]) => `
SELECT
  MFGNUM_0 AS MFGNUM,
  SUM(CPLOPETIM_0 + CPLSETTIM_0) AS HEURES_REALISEES
FROM MFGOPE
WHERE MFGNUM_0 IN (${mfgnums.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')})
GROUP BY MFGNUM_0
`

// Tolérance de date du matcher OF↔commande — même valeur que poste_engagement_loader.ts
// (panneau engagement) et le board, pour un matching cohérent partout dans l'appli.
const MATCH_DATE_TOLERANCE_DAYS = 30

type RawRow = Record<string, string | null>

export interface RetardLigne {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  dateExp: string
  dateExpIso: string | null
  qteRestante: number
  heures: number
  postes: string[]
}

export interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function toNum(v: string | null | undefined): number {
  return parseFloat(v ?? '0') || 0
}

export class RetardRepository {
  async getRetardKpi(refDate: Date, lookbackDays: number): Promise<RetardChargeKpi> {
    const from = new Date(refDate)
    from.setDate(refDate.getDate() - lookbackDays)

    const db = new X3Database()
    let rows: RawRow[] = []
    try {
      rows = await db.raw(buildSql(toYYYYMMDD(from), toYYYYMMDD(refDate)))
    } finally {
      await db.destroy()
    }

    // Gamme depuis SQLite (boardDataset.getReferential, cache 2h — 0 SOAP).
    const ref = await boardDataset.getReferential()
    const opsByArticle = new Map<
      string,
      Array<{ workstation: string; label: string; rate: number }>
    >()
    for (const g of ref.gamme) {
      if (!g.workstation || g.rate <= 0) continue
      const arr = opsByArticle.get(g.article) ?? []
      arr.push({
        workstation: g.workstation,
        label: g.workstationLabel || g.workstation,
        rate: g.rate,
      })
      opsByArticle.set(g.article, arr)
    }

    // Stock disponible non alloué, consommé au fil de l'eau (FIFO sur ENDDAT_0, déjà
    // trié par la requête) : une ligne couverte par du stock fabriqué mais pas encore
    // affecté à SA commande n'est pas un retard de production.
    const candidateArticles = [
      ...new Set(
        rows
          .map((r) => r.ARTICLE?.trim() ?? '')
          .filter((a) => a && (opsByArticle.get(a)?.length ?? 0) > 0)
      ),
    ]
    const stockDispo = new Map<string, number>()
    if (candidateArticles.length > 0) {
      const stockDb = new X3Database()
      try {
        for (let i = 0; i < candidateArticles.length; i += 1000) {
          const chunk = candidateArticles.slice(i, i + 1000)
          const stockRows: RawRow[] = await stockDb.raw(buildStockSql(chunk))
          for (const sr of stockRows) {
            const art = sr.ARTICLE?.trim()
            if (!art) continue
            stockDispo.set(art, Math.max(0, Number.parseFloat(sr.QTE_DISPO ?? '0') || 0))
          }
        }
      } finally {
        await stockDb.destroy()
      }
    }

    // Détermine, ligne par ligne, la qté qui reste réellement à produire (après
    // allocation existante et stock dispo non alloué) — c'est CETTE qté qu'on soumet
    // au matcher, pas la qté restante brute X3 (RMNEXTQTY_0).
    type PendingLine = { row: RawRow; article: string; qty: number; qteAProduire: number; ops: Array<{ workstation: string; label: string; rate: number }> }
    const pending: PendingLine[] = []
    for (const row of rows) {
      const article = row.ARTICLE?.trim() ?? ''
      const qty = Number.parseFloat(row.QTE_RESTANTE ?? '0') || 0
      const allqty = Number.parseFloat(row.QTE_ALLOUEE ?? '0') || 0

      // Pas un retard de production : article sans gamme (acheté/sous-traité)
      // ou entièrement couvert par allocation stock (pas bloqué en prod).
      const ops = opsByArticle.get(article) ?? []
      if (ops.length === 0) continue
      if (allqty >= qty) continue

      let qteAProduire = qty - allqty
      const dispo = stockDispo.get(article) ?? 0
      if (dispo > 0) {
        const couvert = Math.min(dispo, qteAProduire)
        stockDispo.set(article, dispo - couvert)
        qteAProduire -= couvert
      }
      if (qteAProduire <= 0) continue

      pending.push({ row, article, qty, qteAProduire, ops })
    }

    // Matching OF↔commande — LE MÊME moteur que le board / panneau engagement
    // (CommandeOFMatcher, of-conso.ts) : contremarque hard peg prioritaire, sinon
    // heuristique MTS/NOR/MTO par statut+date. Supply = boardDataset.getOrders()
    // (cache SWR partagé, source unique des OF ouverts — pas de requête maison).
    const demandFlows: Flow[] = pending.map((p) => ({
      article: p.article,
      quantity: p.qteAProduire,
      direction: 'demand',
      date: parseX3Date(p.row.DATE_EXP),
      origin: {
        type: 'order',
        id: p.row.SOHNUM?.trim() ?? '',
        customer: p.row.CLIENT?.trim() ?? '',
        pays: null,
        orderType: (p.row.SOHTYP?.trim() || null) as OrderType | null,
        nature: 'COMMANDE',
        contremarque: p.row.CONTREMARQUE?.trim() || null,
        qteCommandee: p.qty,
        qteAllouee: parseFloat(p.row.QTE_ALLOUEE ?? '0') || 0,
        ligne: p.row.LIGNE?.trim() ?? null,
      },
    }))

    const { supply } = await boardDataset.getOrders()
    const matcher = new CommandeOFMatcher(
      supply,
      new Map<string, Article>(),
      new Map<string, Nomenclature>(),
      MATCH_DATE_TOLERANCE_DAYS,
    )
    const results = matcher.matchCommandes(demandFlows)
    const resultByFlow = new Map(results.map((r) => [r.demandFlow, r]))

    // Heures déjà réalisées (MFGOPE) pour les OF que le matcher a retenus — évite de
    // requêter tous les OF ouverts, seulement ceux effectivement assignés à une ligne.
    const assignedOfNums = new Set<string>()
    for (const r of results) {
      for (const alloc of r.ofAllocations) {
        const id = (alloc.ofFlow.origin as { id?: string }).id?.trim()
        if (id) assignedOfNums.add(id)
      }
    }
    const heuresByOf = new Map<string, number>()
    if (assignedOfNums.size > 0) {
      const mfgnums = [...assignedOfNums]
      const opDb = new X3Database()
      try {
        for (let i = 0; i < mfgnums.length; i += 1000) {
          const chunk = mfgnums.slice(i, i + 1000)
          const timeRows: RawRow[] = await opDb.raw(buildOpTimeSql(chunk))
          for (const tr of timeRows) {
            const mfgnum = tr.MFGNUM?.trim()
            if (!mfgnum) continue
            heuresByOf.set(mfgnum, Math.max(0, parseFloat(tr.HEURES_REALISEES ?? '0') || 0))
          }
        }
      } finally {
        await opDb.destroy()
      }
    }

    const posteAccum = new Map<string, { label: string; heures: number }>()
    const lignes: RetardLigne[] = []

    for (let i = 0; i < pending.length; i += 1) {
      const p = pending[i]
      const demandFlow = demandFlows[i]
      const row = p.row

      const byPoste: Record<string, number> = {}
      for (const op of p.ops) {
        byPoste[op.workstation] = (byPoste[op.workstation] ?? 0) + p.qteAProduire / op.rate
      }

      // Crédite l'avancement réel des OF assignés par le matcher (heures déjà
      // réalisées, MFGOPE), au prorata de la part de l'OF allouée à CETTE ligne
      // (qteAllouee / quantité totale de l'OF) — un OF peut servir plusieurs lignes.
      const result = resultByFlow.get(demandFlow)
      let creditDispo = 0
      if (result) {
        for (const alloc of result.ofAllocations) {
          const ofId = (alloc.ofFlow.origin as { id?: string }).id?.trim()
          if (!ofId || alloc.ofFlow.quantity <= 0) continue
          const heures = heuresByOf.get(ofId) ?? 0
          creditDispo += heures * (alloc.qteAllouee / alloc.ofFlow.quantity)
        }
      }

      if (creditDispo > 0) {
        const totalLigne = Object.values(byPoste).reduce((s, h) => s + h, 0)
        if (totalLigne > 0) {
          const creditUse = Math.min(creditDispo, totalLigne)
          const ratio = creditUse / totalLigne
          for (const ws of Object.keys(byPoste)) byPoste[ws] *= 1 - ratio
        }
      }

      const totalLigneApresCredit = Object.values(byPoste).reduce((s, h) => s + h, 0)
      if (Math.round(totalLigneApresCredit * 10) / 10 <= 0) continue

      for (const [ws, h] of Object.entries(byPoste)) {
        const label = p.ops.find((o) => o.workstation === ws)?.label ?? ws
        const prev = posteAccum.get(ws) ?? { label, heures: 0 }
        prev.heures += h
        posteAccum.set(ws, prev)
      }

      const date = parseX3Date(row.DATE_EXP)
      const iso = date?.toISOString().slice(0, 10) ?? null
      const lineHeures = Math.round(Object.values(byPoste).reduce((s, h) => s + h, 0) * 10) / 10
      const linePostes = Object.entries(byPoste)
        .sort((a, b) => b[1] - a[1])
        .map(([code]) => code)

      lignes.push({
        numCommande: row.SOHNUM?.trim() ?? '',
        client: row.CLIENT?.trim() ?? '',
        article: p.article,
        designation: row.DESIGNATION?.trim() ?? '',
        type: 'SOH',
        dateExp: iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '',
        dateExpIso: iso,
        qteRestante: Math.round(toNum(row.QTE_RESTANTE)),
        heures: lineHeures,
        postes: linePostes,
      })
    }

    const postes = [...posteAccum.entries()]
      .map(([code, v]) => ({ code, label: v.label, heures: Math.round(v.heures * 10) / 10 }))
      .sort((a, b) => b.heures - a.heures)

    const totalHeures = Math.round(postes.reduce((s, p) => s + p.heures, 0) * 10) / 10

    return { totalHeures, nbLignes: lignes.length, postes, lignes }
  }
}
