import { X3Database } from '#app/x3/client/x3_database'
import { parseX3Date } from '#app/x3/utils/parse_date'
import { isoDay } from '#app/utils/dates'
import replicaGate from '#services/replica_gate'
import ordersFluxReplicaRepository from '#repositories/orders_flux_replica_repository'
import stockReplicaRepository from '#repositories/stock_replica_repository'
import boardDataset from '#services/board_dataset'
import { CommandeOFMatcher } from '#app/domain/of_conso'
import { computeAvancement, resteAProduire } from '#app/domain/of_avancement'
import {
  computeJoursRetard,
  computeProfondeur,
  emptyProfondeur,
  type RetardProfondeurKpi,
} from '#app/domain/retard_profondeur'
import type { Flow, OrderType } from '#app/domain/models/flow'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'

export type { RetardProfondeurKpi }

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
  O.EXTQTY_0    AS QTE_COMMANDEE,
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

// KPI « charge en retard » : les commandes sont DÉJÀ en retard — leur OF de couverture
// est souvent planifié hors des ±30 j du board/engagement. Avec 30 j, NOR/MTO ne
// matchait pas → ofAllocations vide → charge brute sans MFGOPE, alors que /suivi
// (fenêtre large, sans ce filtre sur le même besoin) voyait les pointages OP.
// ~10 ans = de facto illimité ; le partage OFConso du matcher reste actif.
const MATCH_DATE_TOLERANCE_DAYS = 3650

type RawRow = Record<string, string | null>

export interface RetardLigne {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  dateExp: string
  dateExpIso: string | null
  /** Jours calendaires de retard (refDate − dateExp). */
  joursRetard: number
  /** Qté totale commandée (ORDERS.EXTQTY) — dénominateur lisible côté commande. */
  qteCommandee: number
  /** Reste à produire (Σ resteAProduire, prorata alloc + non couvert). */
  qteRestante: number
  /** Pièces déjà pointées OP (CPLQTY) — détail OF, pour le tooltip. */
  qteFaite: number
  /** Total lancé OF (EXTQTY) — détail OF, pour le tooltip. */
  qteAProduire: number
  /** N° des OF de couverture matchés — pour le tooltip. */
  numOfs: string[]
  heures: number
  postes: string[]
}

export interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
  /** Sévérité temporelle du même backlog (max / moyenne pondérée / buckets). */
  profondeur: RetardProfondeurKpi
}

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Ligne de commande en retard, NORMALISÉE — indépendante de sa provenance.
 *
 * Le reste de ce KPI travaillait directement sur les `RawRow` d'X3
 * (`row.QTE_RESTANTE` en string, `parseX3Date(row.DATE_EXP)`…). Impossible d'y
 * brancher une seconde source sans fabriquer de faux X3 : `parseX3Date`
 * n'accepte que `dd-MMM-yy`, et reformater une date locale vers ce format pour
 * la reparser aussitôt serait une perte de précision gratuite (année sur deux
 * chiffres). D'où ce type, produit par les deux voies.
 */
type RetardLine = {
  numCommande: string
  ligne: string | null
  client: string | null
  article: string
  designation: string | null
  dateExpedition: Date | null
  /** `RMNEXTQTY_0` brut, allocations comprises. */
  qteRestante: number
  /** `EXTQTY_0`. */
  qteCommandee: number
  /** `ALLQTY_0`. */
  qteAllouee: number
  contremarque: string | null
  orderType: OrderType | null
}

function toRetardLine(row: RawRow): RetardLine {
  const num = (v: string | null | undefined) => Number.parseFloat(v ?? '0') || 0
  return {
    numCommande: row.SOHNUM?.trim() ?? '',
    ligne: row.LIGNE?.trim() || null,
    client: row.CLIENT?.trim() || null,
    article: row.ARTICLE?.trim() ?? '',
    designation: row.DESIGNATION?.trim() || null,
    dateExpedition: parseX3Date(row.DATE_EXP),
    qteRestante: num(row.QTE_RESTANTE),
    qteCommandee: num(row.QTE_COMMANDEE),
    qteAllouee: num(row.QTE_ALLOUEE),
    contremarque: row.CONTREMARQUE?.trim() || null,
    orderType: (row.SOHTYP?.trim() || null) as OrderType | null,
  }
}

export class RetardRepository {
  /**
   * Les deux sources de ce KPI — lignes de commande et stock disponible — sont
   * servies ENSEMBLE ou pas du tout.
   *
   * Le stock est consommé au fil de l'eau contre les lignes triées par échéance :
   * mélanger des lignes figées à T avec un stock lu à T+Δ reproduirait la « vue
   * déchirée » que l'issue #98 écarte pour l'ingestion, mais à la lecture — c'est
   * exactement la régression `getOrdersForWindow` du lot 2, et le motif pour
   * lequel `matchingFamilyOnReplica()` avait été introduit.
   */
  private async replicaServesRetard(): Promise<boolean> {
    const [lines, stock] = await Promise.all([
      replicaGate.canRead('orders_flux_replica'),
      replicaGate.canRead('stock_replica'),
    ])
    return lines && stock
  }

  async getRetardKpi(refDate: Date, lookbackDays: number): Promise<RetardChargeKpi> {
    const from = new Date(refDate)
    from.setDate(refDate.getDate() - lookbackDays)

    const onReplica = await this.replicaServesRetard()

    let rows: RetardLine[]
    if (onReplica) {
      // `RetardReplicaLine` est structurellement plus étroit (`dateExpedition`
      // et `ligne` non nullables) : assignable tel quel, pas de conversion.
      rows = await ordersFluxReplicaRepository.getRetardLines(isoDay(from), isoDay(refDate))
    } else {
      const db = new X3Database()
      try {
        const raw: RawRow[] = await db.raw(buildSql(toYYYYMMDD(from), toYYYYMMDD(refDate)))
        rows = raw.map(toRetardLine)
      } finally {
        await db.destroy()
      }
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
        rows.map((r) => r.article).filter((a) => a && (opsByArticle.get(a)?.length ?? 0) > 0)
      ),
    ]
    const stockDispo = new Map<string, number>()
    if (candidateArticles.length > 0) {
      if (onReplica) {
        // `stock_replica` mire `ITMMVT` : `physique/alloue_phys/alloue_global`
        // sont `PHYSTO_0/PHYALL_0/GLOALL_0`, donc la même soustraction que
        // `buildStockSql`. Pas de chunk par 1000 — c'est une limite du `IN`
        // d'Oracle, sans objet en SQL local.
        for (const s of await stockReplicaRepository.getDisponibleByArticle(candidateArticles)) {
          stockDispo.set(s.article, Math.max(0, s.disponible))
        }
      } else {
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
    }

    // Détermine, ligne par ligne, la qté qui reste réellement à produire (après
    // allocation existante et stock dispo non alloué) — c'est CETTE qté qu'on soumet
    // au matcher, pas la qté restante brute X3 (RMNEXTQTY_0).
    type PendingLine = {
      line: RetardLine
      article: string
      qty: number
      qteCommandee: number
      qteAProduire: number
      ops: Array<{ workstation: string; label: string; rate: number }>
    }
    const pending: PendingLine[] = []
    for (const line of rows) {
      const article = line.article
      const qty = line.qteRestante
      const qteCommandee = line.qteCommandee
      const allqty = line.qteAllouee

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

      pending.push({ line, article, qty, qteCommandee, qteAProduire, ops })
    }

    // Matching OF↔commande — LE MÊME moteur que le board / panneau engagement
    // (CommandeOFMatcher, of-conso.ts) : contremarque hard peg prioritaire, sinon
    // heuristique MTS/NOR/MTO par statut+date. Supply = boardDataset.getOrders()
    // (cache SWR partagé, source unique des OF ouverts — pas de requête maison).
    const demandFlows: Flow[] = pending.map((p) => ({
      article: p.article,
      quantity: p.qteAProduire,
      direction: 'demand',
      date: p.line.dateExpedition,
      origin: {
        type: 'order',
        id: p.line.numCommande,
        customer: p.line.client ?? '',
        pays: null,
        orderType: p.line.orderType,
        nature: 'COMMANDE',
        contremarque: p.line.contremarque,
        qteCommandee: p.qteCommandee,
        qteAllouee: p.line.qteAllouee,
        ligne: p.line.ligne,
      },
    }))

    const { supply } = await boardDataset.getOrders()
    const matcher = new CommandeOFMatcher(
      supply,
      new Map<string, Article>(),
      new Map<string, Nomenclature>(),
      MATCH_DATE_TOLERANCE_DAYS
    )
    const results = matcher.matchCommandes(demandFlows)
    const resultByFlow = new Map(results.map((r) => [r.demandFlow, r]))

    // MFGOPE : tous les OF ouverts des articles en retard (comme /suivi charge
    // les OF de fenêtre avant matching), pas seulement ceux déjà matchés — sinon
    // un OF hors tolérance date restait invisible au calcul d'avancement.
    const pendingArticles = new Set(pending.map((p) => p.article))
    const assignedOfNums = new Set<string>()
    for (const f of supply) {
      if (f.direction !== 'supply' || f.origin.type !== 'of' || f.quantity <= 0) continue
      if (!pendingArticles.has(f.article)) continue
      const id = (f.origin as { id?: string }).id?.trim()
      if (id) assignedOfNums.add(id)
    }
    for (const r of results) {
      for (const alloc of r.ofAllocations) {
        const id = (alloc.ofFlow.origin as { id?: string }).id?.trim()
        if (id) assignedOfNums.add(id)
      }
    }
    const operations =
      assignedOfNums.size > 0 ? await boardDataset.getOperations([...assignedOfNums]) : []
    const avancementByOf = computeAvancement(operations)

    const posteAccum = new Map<string, { label: string; heures: number }>()
    const lignes: RetardLigne[] = []
    const refIso = refDate.toISOString().slice(0, 10)

    for (const [i, p] of pending.entries()) {
      const demandFlow = demandFlows[i]
      const line = p.line
      const result = resultByFlow.get(demandFlow)

      // Contremarque vers OF clôturé / stock complet : rien à produire en atelier.
      if (result && result.ofAllocations.length === 0 && result.remainingUncoveredQty <= 0) {
        continue
      }

      // Charge + affichage qté : computeAvancement + resteAProduire (comme /suivi).
      let qteCharge = 0
      let qteCouverte = 0
      let qteFaite = 0
      let qteTotaleOf = 0
      const ofs: string[] = []
      if (result) {
        for (const alloc of result.ofAllocations) {
          const origin = alloc.ofFlow.origin as { id?: string; launched?: number }
          const ofId = origin.id?.trim()
          if (!ofId || alloc.ofFlow.quantity <= 0 || alloc.qteAllouee <= 0) continue
          ofs.push(ofId)
          qteCouverte += alloc.qteAllouee
          const qtyRealisee = avancementByOf.get(ofId)?.qtyRealisee ?? 0
          const ofReste = resteAProduire(alloc.ofFlow.quantity, origin.launched, qtyRealisee)
          const launched = origin.launched ?? alloc.ofFlow.quantity
          qteFaite += Math.min(qtyRealisee, launched)
          qteTotaleOf += Math.round(launched)
          qteCharge += alloc.qteAllouee * (ofReste / alloc.ofFlow.quantity)
        }
      }
      qteCharge += Math.max(0, p.qteAProduire - qteCouverte)
      if (Math.round(qteCharge * 10) / 10 <= 0) continue

      const qteRestante = Math.round(qteCharge)
      const qteAProduire = qteTotaleOf > 0 ? qteTotaleOf : Math.round(p.qteAProduire)
      qteFaite = Math.round(qteFaite)

      const byPoste: Record<string, number> = {}
      for (const op of p.ops) {
        byPoste[op.workstation] = (byPoste[op.workstation] ?? 0) + qteCharge / op.rate
      }

      for (const [ws, h] of Object.entries(byPoste)) {
        const label = p.ops.find((o) => o.workstation === ws)?.label ?? ws
        const prev = posteAccum.get(ws) ?? { label, heures: 0 }
        prev.heures += h
        posteAccum.set(ws, prev)
      }

      const date = line.dateExpedition
      const iso = date?.toISOString().slice(0, 10) ?? null
      const lineHeures = Math.round(Object.values(byPoste).reduce((s, h) => s + h, 0) * 10) / 10
      const linePostes = Object.entries(byPoste)
        .sort((a, b) => b[1] - a[1])
        .map(([code]) => code)
      const joursRetard = computeJoursRetard(iso, refIso)

      lignes.push({
        numCommande: line.numCommande,
        client: line.client ?? '',
        article: p.article,
        designation: line.designation ?? '',
        type: 'SOH',
        dateExp: iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '',
        dateExpIso: iso,
        joursRetard,
        qteCommandee: Math.round(p.qteCommandee),
        qteRestante,
        qteFaite,
        qteAProduire,
        numOfs: ofs,
        heures: lineHeures,
        postes: linePostes,
      })
    }

    const postes = [...posteAccum.entries()]
      .map(([code, v]) => ({ code, label: v.label, heures: Math.round(v.heures * 10) / 10 }))
      .sort((a, b) => b.heures - a.heures)

    const totalHeures = Math.round(postes.reduce((s, p) => s + p.heures, 0) * 10) / 10
    const profondeur = lignes.length > 0 ? computeProfondeur(lignes) : emptyProfondeur()

    return { totalHeures, nbLignes: lignes.length, postes, lignes, profondeur }
  }
}
