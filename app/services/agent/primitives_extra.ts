/**
 * Primitifs supply — lots restants (étape 4 minimisée).
 * Lazy-import depuis tools.ts pour ne pas booter Lucid au charge CLI.
 */

import boardDataset from '#services/board_dataset'
import { evaluateScenarioDiff } from '#services/scenario_diff_loader'
import { ScenarioStore } from '#services/scenario_store'
import { loadPosteEngagement } from '#services/poste_engagement_loader'
import { loadShortageRowsData } from '#services/shortage_payload_loader'
import { loadChargePayloadData } from '#services/load_payload_loader'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import { loadOrderLineDetail } from '#services/order_line_detail_loader'
import { buildStockBreakdownMap } from '#services/suivi_service'
import type { PlanMutation } from '#app/domain/plan-diff'

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** Invalide caches board (live X3 au prochain accès). */
export async function rafraichir(article?: string) {
  if (article?.trim()) {
    // Invalidation ciblée non exposée par boardDataset → reload global.
    // Documenté : granularité article = même coût que global en v1.
    await boardDataset.reloadAll()
    return {
      _source: 'rafraichir' as const,
      scope: 'all' as const,
      note: `reloadAll (article=${article.trim()} demandé ; invalidation fine v1 non dispo)`,
      ok: true,
    }
  }
  await boardDataset.reloadAll()
  return { _source: 'rafraichir' as const, scope: 'all' as const, ok: true }
}

/**
 * Simulation éphémère : evaluatePlanDiff en RAM via evaluateScenarioDiff.
 * mutations = PlanMutation[] (shift_of / shift_demand / inject_demand / suspend_supply).
 */
export async function simulerDecalage(params: {
  mutations: PlanMutation[]
  from?: string
  to?: string
  horizonDays?: number
}) {
  if (!Array.isArray(params.mutations) || params.mutations.length === 0) {
    return { error: 'mutations[] requis', _source: 'simulerDecalage' as const }
  }

  const from = params.from ? new Date(params.from) : new Date()
  if (Number.isNaN(from.getTime())) {
    return { error: 'from invalide', _source: 'simulerDecalage' as const }
  }
  from.setHours(0, 0, 0, 0)

  let to: Date
  if (params.to) {
    to = new Date(params.to)
    if (Number.isNaN(to.getTime())) {
      return { error: 'to invalide', _source: 'simulerDecalage' as const }
    }
  } else {
    const h =
      params.horizonDays && params.horizonDays > 0
        ? Math.min(Math.floor(params.horizonDays), 90)
        : 28
    to = new Date(from)
    to.setDate(to.getDate() + h)
  }
  to.setHours(23, 59, 59, 999)

  const result = await evaluateScenarioDiff(params.mutations, { from, to })

  // Slim pour le LLM : stats + top dégradations client/appro.
  const clientDeg = result.diff.client
    .filter((e) => e.sens === 'degradation')
    .slice(0, 15)
    .map((e) => ({
      commande: e.numCommande,
      ligne: e.ligne,
      article: e.article,
      client: e.client,
      deltaJours: e.deltaJours,
      statutAvant: e.statutAvant,
      statutApres: e.statutApres,
    }))
  const approDeg = result.diff.appro
    .filter((e) => e.sens === 'degradation')
    .slice(0, 15)
    .map((e) => ({
      composant: e.composant,
      delta: 'deltaShortage' in e ? (e as { deltaShortage?: number }).deltaShortage : undefined,
      sens: e.sens,
    }))

  return {
    _source: 'simulerDecalage' as const,
    engine: 'evaluateScenarioDiff / evaluatePlanDiff',
    window: { from: isoDay(from), to: isoDay(to) },
    mutationsCount: params.mutations.length,
    evaluatedAt: result.evaluatedAt,
    beforeStats: result.beforeStats,
    afterStats: result.afterStats,
    clientDegradations: clientDeg,
    approDegradations: approDeg,
    totals: {
      client: result.diff.client.length,
      appro: result.diff.appro.length,
      allocation: result.diff.allocation.length,
    },
  }
}

/** Persistance explicite d'un scénario (scenario_store). */
export async function enregistrerScenario(params: {
  nom: string
  description?: string
  mutations: PlanMutation[]
  auteur?: string
}) {
  const nom = params.nom?.trim()
  if (!nom) return { error: 'nom requis', _source: 'enregistrerScenario' as const }
  if (!Array.isArray(params.mutations) || params.mutations.length === 0) {
    return { error: 'mutations[] requis', _source: 'enregistrerScenario' as const }
  }

  const store = new ScenarioStore()
  const row = await store.create({
    nom,
    description: params.description ?? null,
    auteur: params.auteur ?? 'agent',
    mutations: params.mutations,
  })
  return {
    _source: 'enregistrerScenario' as const,
    engine: 'ScenarioStore.create',
    id: row.id,
    nom: row.nom,
    statut: row.statut,
    mutationsCount: row.mutations.length,
    createdAt: row.createdAt,
  }
}

/**
 * Ruptures composants + réceptions couvrantes (pipeline /ruptures, issue #49).
 * LE tool pour « quelles réceptions fournisseurs ? » : chaque ligne porte la
 * réception couvrante (n° PO, fournisseur, qté, date) ou son absence
 * (verdict sans_couverture) — pas d'inférence via getPromise.
 */
export async function listerRuptures(params: {
  /** Horizon jours (fenêtre STRDAT des OF, défaut 14, max 90). */
  horizonDays?: number
  /** Début fenêtre ISO (défaut aujourd'hui). */
  from?: string
  /** Filtre article composant exact (insensible à la casse). */
  composant?: string
  /** Filtre verdicts : couvert | a_risque | retard | sans_couverture | sous_ensemble. */
  verdicts?: string[]
  /** Max lignes (défaut 60, max 150). */
  limit?: number
} = {}) {
  const data = await loadShortageRowsData({
    start: params.from,
    days: params.horizonDays,
  })

  const composantFilter = params.composant?.trim().toUpperCase() || null
  const verdictFilter =
    Array.isArray(params.verdicts) && params.verdicts.length > 0
      ? new Set(params.verdicts.map((v) => String(v).trim().toLowerCase()))
      : null
  const limitRaw = params.limit === undefined ? 60 : Math.floor(Number(params.limit))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 150) : 60

  const filtered = data.rows.filter((r) => {
    if (composantFilter && r.component.toUpperCase() !== composantFilter) return false
    if (verdictFilter && !verdictFilter.has(r.verdict)) return false
    return true
  })

  const verdictCounts: Record<string, number> = {}
  for (const r of filtered) verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1

  return {
    _source: 'listerRuptures' as const,
    engine: 'shortage_payload_loader (rupture-engine + réceptions PORDERQ)',
    window: { from: isoDay(data.windowFrom), days: data.horizon },
    stats: data.stats,
    verdictCounts,
    totalMatching: filtered.length,
    truncated: filtered.length > limit,
    x3Error: data.x3Error,
    ruptures: filtered.slice(0, limit).map((r) => ({
      composant: r.component,
      composantDesc: r.componentDesc,
      qteManquante: r.qteManquante,
      numOf: r.numOf,
      articleParent: r.articleParent,
      numCommande: r.numCommande,
      client: r.client,
      dateExpedition: r.dateExpedition,
      dateBesoin: r.dateBesoin,
      verdict: r.verdict,
      overdue: r.overdue,
      joursMarge: r.joursMarge,
      joursRetardReception: r.joursRetardReception,
      reception: r.reception
        ? {
            commandeAchat: r.reception.id,
            fournisseur: r.reception.supplier,
            qty: r.reception.qty,
            dateArrivee: r.reception.dateArrivee,
          }
        : null,
      sousEnsembleOfs: r.sousEnsembleOfs,
    })),
  }
}

/**
 * Stock net par article : strict (utilisable), QC (bloqué contrôle qualité), total.
 * Source = flux stock board (STOCK X3, cache SWR).
 */
export async function getStock(params: { articles: string[] }) {
  const articles = Array.isArray(params.articles)
    ? [...new Set(params.articles.map((a) => String(a).trim()).filter(Boolean))]
    : []
  if (articles.length === 0) {
    return { error: 'articles[] requis', _source: 'getStock' as const }
  }
  if (articles.length > 50) {
    return { error: 'max 50 articles par appel', _source: 'getStock' as const }
  }

  const flows = await boardDataset.getStock(articles).catch(() => [])
  const breakdown = buildStockBreakdownMap(flows)

  return {
    _source: 'getStock' as const,
    engine: 'boardDataset.getStock + buildStockBreakdownMap',
    note: 'Stock photo usine — ne dit pas ce qui est alloué à un OF donné (voir getVerdict).',
    stocks: articles.map((a) => {
      const b = breakdown.get(a)
      return {
        article: a,
        strict: b?.strict ?? 0,
        qc: b?.qc ?? 0,
        total: b?.total ?? 0,
        inconnu: !b,
      }
    }),
  }
}

/**
 * Statuts des commandes clientes sur une fenêtre (moteur order-impacts,
 * pipeline /programme) : on_time | stock | retard | bloquee | sans_couverture.
 */
export async function listerCommandesStatut(params: {
  /** Horizon jours (défaut 14, max 90). */
  horizonDays?: number
  /** Début ISO (défaut aujourd'hui). */
  from?: string
  /** Filtre client (sous-chaîne, insensible à la casse). */
  client?: string
  /** Filtre statuts : on_time | stock | retard | bloquee | sans_couverture. */
  statuts?: string[]
  /** Max lignes (défaut 60, max 150). */
  limit?: number
} = {}) {
  const horizonRaw = params.horizonDays ?? 14
  const horizon =
    Number.isFinite(horizonRaw) && horizonRaw > 0 ? Math.min(Math.floor(horizonRaw), 90) : 14
  const from = params.from ? new Date(params.from) : new Date()
  if (Number.isNaN(from.getTime())) {
    return { error: 'from invalide', _source: 'listerCommandesStatut' as const }
  }
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + horizon)
  to.setHours(23, 59, 59, 999)

  const { result } = await loadOrderImpacts({ from, to, pipeline: 'programme' })

  const clientFilter = params.client?.trim().toLowerCase() || null
  const statutFilter =
    Array.isArray(params.statuts) && params.statuts.length > 0
      ? new Set(params.statuts.map((s) => String(s).trim().toLowerCase()))
      : null
  const limitRaw = params.limit === undefined ? 60 : Math.floor(Number(params.limit))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 150) : 60

  const filtered = result.orders.filter((o) => {
    if (clientFilter && !o.client.toLowerCase().includes(clientFilter)) return false
    if (statutFilter && !statutFilter.has(o.statut)) return false
    return true
  })

  return {
    _source: 'listerCommandesStatut' as const,
    engine: 'order_impacts_loader.evaluateOrderImpacts (pipeline programme)',
    window: result.window,
    stats: result.stats,
    totalMatching: filtered.length,
    truncated: filtered.length > limit,
    commandes: filtered.slice(0, limit).map((o) => ({
      numCommande: o.numCommande,
      ligne: o.ligne ?? null,
      client: o.client,
      article: o.article,
      description: o.description,
      qteRestante: o.qteRestante,
      dateExpedition: o.dateExpedition,
      dejaEnRetard: o.dejaEnRetard,
      nature: o.nature,
      statut: o.statut,
      joursRetard: o.joursRetard,
      ofs: o.ofs.slice(0, 3).map((f) => ({
        numOf: f.numOf,
        feasible: f.feasible,
        dateFin: f.dateFin,
      })),
    })),
  }
}

/** Détail d'une ligne de commande (loadOrderLineDetail) : OF liés, poste, BOM directe. */
export async function getDetailCommande(params: { numCommande: string; ligne: string }) {
  const num = params.numCommande?.trim()
  const ligne = params.ligne?.trim()
  if (!num || !ligne) {
    return { error: 'numCommande et ligne requis', _source: 'getDetailCommande' as const }
  }
  const detail = await loadOrderLineDetail(num, ligne)
  if (!detail) {
    return {
      error: `Ligne introuvable : ${num} #${ligne}`,
      _source: 'getDetailCommande' as const,
    }
  }
  return {
    _source: 'getDetailCommande' as const,
    engine: 'order_line_detail_loader',
    ...detail,
  }
}

/** Somme des heures d'une période de charge (fermes+planifiés+suggérés+induits). */
function periodTotal(p: { f: number; p: number; s: number; fi: number; si: number }): number {
  return p.f + p.p + p.s + p.fi + p.si
}

/**
 * Charge vs capacité par poste (payload /charge). Sans filtre : agrégats par poste.
 * Avec `poste` : détail hebdo (charge, capacité, saturation).
 */
export async function getCharge(params: {
  /** Filtre poste (sous-chaîne sur code ou libellé, insensible à la casse). */
  poste?: string
  /** Début horizon ISO (défaut mois courant ; horizon fixe 6 mois). */
  start?: string
  /** Vue : 'of' = OF réels du plan (défaut) ; 'commandes' = besoin commandes explosé. */
  vue?: 'of' | 'commandes'
} = {}) {
  const payload = await loadChargePayloadData({ start: params.start })
  const vue = params.vue === 'commandes' ? 'commandes' : 'of'
  const lines = vue === 'commandes' ? payload.cmdLines : payload.ofLines
  const posteFilter = params.poste?.trim().toLowerCase() || null

  const matching = posteFilter
    ? lines.filter(
        (l) =>
          l.code.toLowerCase().includes(posteFilter) || l.name.toLowerCase().includes(posteFilter)
      )
    : lines

  const summary = matching.map((l) => {
    const chargeParSemaine = l.weekly.map(periodTotal)
    const capaciteParSemaine = l.capacity.weekly
    let semainesSaturees = 0
    for (let i = 0; i < chargeParSemaine.length; i++) {
      const cap = capaciteParSemaine[i] ?? 0
      if (cap > 0 && chargeParSemaine[i] > cap) semainesSaturees++
    }
    return {
      poste: l.code,
      libelle: l.name,
      atelier: l.atelierLabel,
      totalHeures: Math.round(chargeParSemaine.reduce((a, b) => a + b, 0)),
      totalCapacite: Math.round(capaciteParSemaine.reduce((a, b) => a + b, 0)),
      semainesSaturees,
      // Détail hebdo seulement en mode filtré (budget contexte).
      ...(posteFilter
        ? {
            semaines: payload.weeks.map((w: string, i: number) => ({
              semaine: w.replace('\n', ' '),
              charge: Math.round(chargeParSemaine[i] ?? 0),
              capacite: Math.round(capaciteParSemaine[i] ?? 0),
              sature:
                (capaciteParSemaine[i] ?? 0) > 0 &&
                (chargeParSemaine[i] ?? 0) > (capaciteParSemaine[i] ?? 0),
            })),
          }
        : {}),
    }
  })

  summary.sort((a, b) => b.semainesSaturees - a.semainesSaturees || b.totalHeures - a.totalHeures)

  return {
    _source: 'getCharge' as const,
    engine: 'load_payload_loader (charge vs capacité WORKSTATIO × calendrier)',
    vue,
    horizon: payload.rangeLabel,
    postesCount: matching.length,
    x3Error: payload.x3Error,
    postes: summary.slice(0, posteFilter ? 10 : 40),
  }
}

/** Scénarios persistés (scenario_store). */
export async function listerScenarios() {
  const store = new ScenarioStore()
  const rows = await store.list()
  return {
    _source: 'listerScenarios' as const,
    engine: 'ScenarioStore.list',
    count: rows.length,
    scenarios: rows.slice(0, 30).map((r) => ({
      id: r.id,
      nom: r.nom,
      statut: r.statut,
      auteur: r.auteur,
      mutationsCount: Array.isArray(r.mutations) ? r.mutations.length : 0,
      createdAt: r.createdAt,
    })),
  }
}

/** Engagement OF fermes d'un poste (issue #46). */
export async function getEngagementPoste(poste: string) {
  const p = poste?.trim()
  if (!p) return { error: 'poste requis', _source: 'getEngagementPoste' as const }
  const data = await loadPosteEngagement(p)
  const list = data.rows.slice(0, 30).map((r) => ({
    numOf: r.numOf,
    article: r.article,
    designation: r.designation,
    done: r.done,
    launched: r.launched,
    hours: r.hours,
    livraisonIso: r.livraisonIso,
    commandes: r.commandes.slice(0, 5).map((c) => ({
      numCommande: c.numCommande,
      client: c.client,
      livraisonIso: c.livraisonIso,
    })),
  }))

  return {
    _source: 'getEngagementPoste' as const,
    engine: 'loadPosteEngagement',
    poste: data.poste,
    count: data.count,
    totalHours: data.totalHours,
    weeklyCapacityHours: data.weeklyCapacityHours,
    truncated: data.rows.length > 30,
    rows: list,
    x3Error: data.x3Error,
  }
}
