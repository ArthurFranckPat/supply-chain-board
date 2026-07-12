import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import boardDataset from '#services/board_dataset'

// ORDERS WIPTYP=1 (commandes vente) WIPSTA=1 (confirmées).
// ENDDAT_0 = date expé = SHIDAT_0 pour les commandes confirmées.
// RMNEXTQTY_0 = EXTQTY_0 - DLVQTY_0 calculé par X3.
const buildSql = (fromStr: string, toStr: string) => `
SELECT
  O.VCRNUM_0    AS SOHNUM,
  P.BPRNAM_0    AS CLIENT,
  O.ITMREF_0    AS ARTICLE,
  I.ITMDES1_0   AS DESIGNATION,
  O.ENDDAT_0    AS DATE_EXP,
  O.RMNEXTQTY_0 AS QTE_RESTANTE,
  O.ALLQTY_0    AS QTE_ALLOUEE
FROM ORDERS O
INNER JOIN ITMMASTER I ON I.ITMREF_0 = O.ITMREF_0
LEFT JOIN BPARTNER P ON P.BPRNUM_0 = O.BPRNUM_0
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

    const posteAccum = new Map<string, { label: string; heures: number }>()
    const lignes: RetardLigne[] = []

    for (const row of rows) {
      const article = row.ARTICLE?.trim() ?? ''
      const qty = Number.parseFloat(row.QTE_RESTANTE ?? '0') || 0
      const allqty = Number.parseFloat(row.QTE_ALLOUEE ?? '0') || 0
      const date = parseX3Date(row.DATE_EXP)
      const iso = date?.toISOString().slice(0, 10) ?? null

      // Pas un retard de production : article sans gamme (acheté/sous-traité)
      // ou entièrement couvert par allocation stock (pas bloqué en prod).
      const ops = opsByArticle.get(article) ?? []
      if (ops.length === 0) continue
      if (allqty >= qty) continue

      // Le reste non alloué à la commande peut être couvert par du stock disponible
      // non affecté (produit mais pas encore alloué) : ce n'est pas bloqué en prod.
      let qteAProduire = qty - allqty
      const dispo = stockDispo.get(article) ?? 0
      if (dispo > 0) {
        const couvert = Math.min(dispo, qteAProduire)
        stockDispo.set(article, dispo - couvert)
        qteAProduire -= couvert
      }
      if (qteAProduire <= 0) continue

      const byPoste: Record<string, number> = {}
      for (const op of ops) {
        byPoste[op.workstation] = (byPoste[op.workstation] ?? 0) + qteAProduire / op.rate
      }

      for (const [ws, h] of Object.entries(byPoste)) {
        const label = ops.find((o) => o.workstation === ws)?.label ?? ws
        const prev = posteAccum.get(ws) ?? { label, heures: 0 }
        prev.heures += h
        posteAccum.set(ws, prev)
      }

      const lineHeures = Math.round(Object.values(byPoste).reduce((s, h) => s + h, 0) * 10) / 10
      const linePostes = Object.entries(byPoste)
        .sort((a, b) => b[1] - a[1])
        .map(([code]) => code)

      lignes.push({
        numCommande: row.SOHNUM?.trim() ?? '',
        client: row.CLIENT?.trim() ?? '',
        article,
        designation: row.DESIGNATION?.trim() ?? '',
        type: 'SOH',
        dateExp: iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '',
        dateExpIso: iso,
        qteRestante: Math.round(qty),
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
