/**
 * Moteur de diff — évaluer(plan) vs évaluer(plan + mutations) (issue #56, vision étage 2).
 *
 * Pur, sans I/O : applique des mutations aux flows (généralisation du pattern
 * OfOverride), exécute evaluateOrderImpacts deux fois, et produit un diff signé
 * sur 4 axes : client (statuts/retards), appro (couvertures composants),
 * allocation (bénéficiaires du matching), charge (poste × semaine).
 *
 * Principe acté (vision §5) : la sortie est un CONSTAT, pas une prescription.
 * Pas de solver, pas de re-calage proposé.
 */

import type { Flow } from './models/flow.js'
import type { Article } from './models/article.js'
import type { FeasibilityOptions } from './stock-state.js'
import type { Nomenclature } from './models/nomenclature.js'
import {
  evaluateOrderImpacts,
  type OrderImpactResult,
  type OrderImpactRow,
} from './order-impacts.js'
import type { OfOverride } from './planning_board.js'
import type { AllocationStrategy } from './of-conso.js'

// ---------------------------------------------------------------------------
// Mutations (primitive de la vision §3)
// ---------------------------------------------------------------------------

export type PlanMutation =
  /** OF décalé : date de fin (ISO) et/ou poste. dateDebut optionnelle (translation). */
  | {
      type: 'shift_of'
      numOf: string
      dateFin?: string | null
      dateDebut?: string | null
      poste?: string | null
    }
  /** Demande décalée : commande(#ligne) déplacée à une nouvelle date de besoin. */
  | { type: 'shift_demand'; numCommande: string; ligne?: string | null; date: string }
  /** Commande virtuelle injectée (what-if). L'id doit être unique dans le plan. */
  | {
      type: 'inject_demand'
      id: string
      article: string
      quantity: number
      date: string
      client?: string
      ligne?: string | null
      /** true si la date vient du moteur CTP (« au plus tôt ») — informatif, ignoré par le diff. */
      earliest?: boolean
    }
  /** Rupture simulée : supply d'un composant retirée (delay absent) ou retardée à `delay`. */
  | { type: 'suspend_supply'; article: string; sourceId?: string; delay?: string }

// ---------------------------------------------------------------------------
// Diff — sortie structurée par axe, chaque entrée signée
// ---------------------------------------------------------------------------

export type DiffSens = 'degradation' | 'amelioration'

export interface ClientDiffEntry {
  numCommande: string
  ligne: string | null
  article: string
  client: string
  statutAvant: OrderImpactRow['statut'] | null
  statutApres: OrderImpactRow['statut'] | null
  joursRetardAvant: number
  joursRetardApres: number
  /** joursRetardApres − joursRetardAvant */
  deltaJours: number
  /** true si la commande n'existe que dans le plan muté (inject_demand). */
  nouvelle: boolean
  /** true si la commande sort du plan muté (shift_demand hors fenêtre). */
  disparue: boolean
  sens: DiffSens
}

export interface ApproDiffEntry {
  composant: string
  manquantAvant: number
  manquantApres: number
  /** manquantApres − manquantAvant (positif = couverture qui casse). */
  delta: number
  /** OFs dont le manquant sur ce composant a changé. */
  ofs: string[]
  sens: DiffSens
}

export interface AllocationDiffEntry {
  numCommande: string
  ligne: string | null
  article: string
  /** OFs perdus par cette demande. */
  perd: string[]
  /** OFs gagnés par cette demande. */
  gagne: string[]
  /** Pour chaque OF perdu : la ou les demandes qui le détiennent dans le plan muté. */
  beneficiaires: Array<{ numOf: string; commandes: string[] }>
  /** reliquatApres − reliquatAvant (positif = couverture perdue non remplacée). */
  deltaReliquat: number
  sens: DiffSens
}

export interface ChargeDiffEntry {
  poste: string
  /** Lundi de la semaine, ISO (YYYY-MM-DD). */
  semaine: string
  /** Δ heures sur ce poste-semaine (positif = charge ajoutée). */
  deltaHeures: number
  /** Δ en % de la capacité si connue, sinon null. */
  deltaPct: number | null
}

export interface ApproVerdictEntry {
  composant: string
  numOf: string
  verdict: 'inevitable' | 'recalable' | 'dormant'
  dateAvant: string
  dateApres: string
  quantite: number
  reorderDelay: number
}

export interface PlanDiff {
  client: ClientDiffEntry[]
  appro: ApproDiffEntry[]
  approVerdicts: ApproVerdictEntry[]
  allocation: AllocationDiffEntry[]
  charge: ChargeDiffEntry[]
  stats: { degradations: number; ameliorations: number }
}

/** Charge d'un OF dans le plan actuel — nécessaire à l'axe charge (le moteur
 *  d'impact ne connaît pas les postes). Semaine dérivée de dateFin. */
export interface OfCharge {
  numOf: string
  poste: string
  /** Date de référence du bucket (dateFin OF), ISO. */
  dateFin: string
  heures: number
}

// ---------------------------------------------------------------------------
// Application des mutations aux flows (pur — ne modifie pas les entrées)
// ---------------------------------------------------------------------------

export interface PlanInputs {
  demands: Flow[]
  supplyFlows: Flow[]
  overrides: Map<string, OfOverride>
}

function parseIso(value: string): Date {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Applique N mutations à un plan. Composable : chaque mutation opère sur la
 * sortie de la précédente. shift_of réutilise le mécanisme OfOverride (le
 * moteur d'impact lit déjà les overrides pour les dates effectives).
 */
export function applyMutations(inputs: PlanInputs, mutations: PlanMutation[]): PlanInputs {
  let demands = [...inputs.demands]
  let supplyFlows = [...inputs.supplyFlows]
  const overrides = new Map(inputs.overrides)

  for (const m of mutations) {
    switch (m.type) {
      case 'shift_of': {
        const existing = overrides.get(m.numOf)
        overrides.set(m.numOf, {
          numOf: m.numOf,
          dateDebut: m.dateDebut !== undefined ? m.dateDebut : (existing?.dateDebut ?? null),
          dateFin: m.dateFin !== undefined ? m.dateFin : (existing?.dateFin ?? null),
          status: existing?.status ?? null,
          workstation: m.poste !== undefined ? m.poste : (existing?.workstation ?? null),
          note: existing?.note ?? null,
          updatedAt: existing?.updatedAt ?? '',
        })
        break
      }
      case 'shift_demand': {
        demands = demands.map((f) => {
          const origin = f.origin as { id?: string; ligne?: string | null }
          if (f.direction !== 'demand' || origin.id !== m.numCommande) return f
          if (m.ligne != null && (origin.ligne ?? null) !== m.ligne) return f
          return { ...f, date: parseIso(m.date) }
        })
        break
      }
      case 'inject_demand': {
        demands = [
          ...demands,
          {
            article: m.article,
            quantity: m.quantity,
            direction: 'demand',
            date: parseIso(m.date),
            origin: {
              type: 'order',
              id: m.id,
              customer: m.client ?? '',
              pays: null,
              orderType: 'NOR',
              nature: 'COMMANDE',
              contremarque: null,
              qteCommandee: m.quantity,
              qteAllouee: 0,
              ligne: m.ligne ?? null,
            },
          },
        ]
        break
      }
      case 'suspend_supply': {
        supplyFlows = supplyFlows.flatMap((f) => {
          if (f.direction !== 'supply' || f.article !== m.article) return [f]
          const originId = (f.origin as { id?: string }).id
          if (m.sourceId !== undefined && originId !== m.sourceId) return [f]
          if (m.delay !== undefined) return [{ ...f, date: parseIso(m.delay) }]
          return []
        })
        break
      }
    }
  }

  return { demands, supplyFlows, overrides }
}

// ---------------------------------------------------------------------------
// Diff des deux évaluations
// ---------------------------------------------------------------------------

function orderKey(row: OrderImpactRow): string {
  return `${row.numCommande}#${row.ligne ?? ''}#${row.article}`
}

/** Sévérité d'un statut pour signer les transitions (null = hors plan). */
const STATUT_RANK: Record<OrderImpactRow['statut'], number> = {
  on_time: 0,
  stock: 0,
  retard: 1,
  bloquee: 2,
  sans_couverture: 2,
}

function signClient(entry: Omit<ClientDiffEntry, 'sens'>): DiffSens {
  const rankAvant = entry.statutAvant ? STATUT_RANK[entry.statutAvant] : 0
  const rankApres = entry.statutApres ? STATUT_RANK[entry.statutApres] : 0
  if (rankApres !== rankAvant) return rankApres > rankAvant ? 'degradation' : 'amelioration'
  return entry.deltaJours > 0 ? 'degradation' : 'amelioration'
}

function diffClient(before: OrderImpactResult, after: OrderImpactResult): ClientDiffEntry[] {
  const beforeByKey = new Map(before.orders.map((r) => [orderKey(r), r]))
  const afterByKey = new Map(after.orders.map((r) => [orderKey(r), r]))
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()])

  const entries: ClientDiffEntry[] = []
  for (const key of keys) {
    const b = beforeByKey.get(key)
    const a = afterByKey.get(key)
    const ref = (a ?? b)!
    const changed = !b || !a || b.statut !== a.statut || b.joursRetard !== a.joursRetard
    if (!changed) continue

    const base = {
      numCommande: ref.numCommande,
      ligne: ref.ligne ?? null,
      article: ref.article,
      client: ref.client,
      statutAvant: b?.statut ?? null,
      statutApres: a?.statut ?? null,
      joursRetardAvant: b?.joursRetard ?? 0,
      joursRetardApres: a?.joursRetard ?? 0,
      deltaJours: (a?.joursRetard ?? 0) - (b?.joursRetard ?? 0),
      nouvelle: !b,
      disparue: !a,
    }
    entries.push({ ...base, sens: signClient(base) })
  }
  return entries
}

/** Manquants agrégés par composant sur tous les OFs évalués. */
function missingByComponent(
  result: OrderImpactResult
): Map<string, { total: number; ofs: Map<string, number> }> {
  const acc = new Map<string, { total: number; ofs: Map<string, number> }>()
  for (const of of result.ofs) {
    for (const [composant, qty] of Object.entries(of.missingComponents)) {
      if (qty <= 0) continue
      const entry = acc.get(composant) ?? { total: 0, ofs: new Map<string, number>() }
      entry.total += qty
      entry.ofs.set(of.numOf, (entry.ofs.get(of.numOf) ?? 0) + qty)
      acc.set(composant, entry)
    }
  }
  return acc
}

function diffAppro(before: OrderImpactResult, after: OrderImpactResult): ApproDiffEntry[] {
  const missingBefore = missingByComponent(before)
  const missingAfter = missingByComponent(after)
  const composants = new Set([...missingBefore.keys(), ...missingAfter.keys()])

  const entries: ApproDiffEntry[] = []
  for (const composant of composants) {
    const b = missingBefore.get(composant)
    const a = missingAfter.get(composant)
    const manquantAvant = b?.total ?? 0
    const manquantApres = a?.total ?? 0
    if (manquantAvant === manquantApres) continue

    const ofs = new Set<string>()
    for (const numOf of new Set([...(b?.ofs.keys() ?? []), ...(a?.ofs.keys() ?? [])])) {
      if ((b?.ofs.get(numOf) ?? 0) !== (a?.ofs.get(numOf) ?? 0)) ofs.add(numOf)
    }

    entries.push({
      composant,
      manquantAvant,
      manquantApres,
      delta: manquantApres - manquantAvant,
      ofs: [...ofs].sort(),
      sens: manquantApres > manquantAvant ? 'degradation' : 'amelioration',
    })
  }
  return entries
}

function allocatedOfs(row: OrderImpactRow): Set<string> {
  return new Set(row.ofs.map((of) => of.numOf))
}

function diffAllocation(
  before: OrderImpactResult,
  after: OrderImpactResult
): AllocationDiffEntry[] {
  const beforeByKey = new Map(before.orders.map((r) => [orderKey(r), r]))
  const afterByKey = new Map(after.orders.map((r) => [orderKey(r), r]))

  // Index inverse du plan muté : OF → demandes qui le détiennent.
  const holdersAfter = new Map<string, string[]>()
  for (const row of after.orders) {
    for (const of of row.ofs) {
      const holders = holdersAfter.get(of.numOf) ?? []
      holders.push(`${row.numCommande}${row.ligne ? `#${row.ligne}` : ''}`)
      holdersAfter.set(of.numOf, holders)
    }
  }

  const entries: AllocationDiffEntry[] = []
  for (const [key, b] of beforeByKey) {
    const a = afterByKey.get(key)
    const ofsAvant = allocatedOfs(b)
    const ofsApres = a ? allocatedOfs(a) : new Set<string>()
    const perd = [...ofsAvant].filter((of) => !ofsApres.has(of)).sort()
    const gagne = [...ofsApres].filter((of) => !ofsAvant.has(of)).sort()
    if (perd.length === 0 && gagne.length === 0) continue

    const selfId = `${b.numCommande}${b.ligne ? `#${b.ligne}` : ''}`
    const beneficiaires = perd
      .map((numOf) => ({
        numOf,
        commandes: (holdersAfter.get(numOf) ?? []).filter((c) => c !== selfId),
      }))
      .filter((x) => x.commandes.length > 0)

    const deltaReliquat = (a?.reliquat ?? b.qteRestante) - b.reliquat
    entries.push({
      numCommande: b.numCommande,
      ligne: b.ligne ?? null,
      article: b.article,
      perd,
      gagne,
      beneficiaires,
      deltaReliquat,
      sens:
        deltaReliquat > 0 || (perd.length > 0 && gagne.length === 0)
          ? 'degradation'
          : 'amelioration',
    })
  }
  return entries
}

// ---------------------------------------------------------------------------
// Axe charge — poste × semaine, calculé depuis les mutations shift_of
// ---------------------------------------------------------------------------

/** Lundi de la semaine contenant la date, ISO. Calcul en UTC — mélanger
 *  setHours local et toISOString décalerait d'un jour en fuseau positif. */
export function mondayOf(iso: string): string {
  const parsed = new Date(iso)
  const d = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * Δ charge par poste-semaine induit par les mutations shift_of : chaque OF
 * déplacé retire ses heures de son bucket d'origine et les ajoute au bucket
 * cible. `capacites` (heures par poste-semaine) optionnel pour le Δ %.
 */
export function diffCharge(
  ofCharges: OfCharge[],
  mutations: PlanMutation[],
  capacites?: Map<string, number>
): ChargeDiffEntry[] {
  const chargeByOf = new Map(ofCharges.map((c) => [c.numOf, c]))
  const deltas = new Map<string, number>() // `${poste}|${semaine}` → Δ heures

  // Position finale par OF après composition des mutations (le dernier shift gagne).
  const finalByOf = new Map<string, { poste: string; dateFin: string }>()
  for (const m of mutations) {
    if (m.type !== 'shift_of') continue
    const base = chargeByOf.get(m.numOf)
    if (!base) continue
    const current = finalByOf.get(m.numOf) ?? { poste: base.poste, dateFin: base.dateFin }
    finalByOf.set(m.numOf, {
      poste: m.poste ?? current.poste,
      dateFin: m.dateFin ?? current.dateFin,
    })
  }

  for (const [numOf, target] of finalByOf) {
    const base = chargeByOf.get(numOf)!
    const from = `${base.poste}|${mondayOf(base.dateFin)}`
    const to = `${target.poste}|${mondayOf(target.dateFin)}`
    if (from === to) continue
    deltas.set(from, (deltas.get(from) ?? 0) - base.heures)
    deltas.set(to, (deltas.get(to) ?? 0) + base.heures)
  }

  const entries: ChargeDiffEntry[] = []
  for (const [key, deltaHeures] of deltas) {
    if (deltaHeures === 0) continue
    const [poste, semaine] = key.split('|')
    const capacite = capacites?.get(key)
    entries.push({
      poste,
      semaine,
      deltaHeures,
      deltaPct: capacite ? Math.round((deltaHeures / capacite) * 1000) / 10 : null,
    })
  }
  return entries.sort((x, y) =>
    x.poste !== y.poste ? x.poste.localeCompare(y.poste) : x.semaine.localeCompare(y.semaine)
  )
}

// ---------------------------------------------------------------------------
// Orchestrateur : évaluer(plan) vs évaluer(plan + mutations)
// ---------------------------------------------------------------------------

export interface PlanDiffInputs extends PlanInputs {
  nomenclatures: Map<string, Nomenclature>
  articles: Map<string, Article>
  window: { from: Date; to: Date }
  mode?: FeasibilityOptions['mode']
  /** Charges OF (poste + heures) pour l'axe charge. Absent → axe vide. */
  ofCharges?: OfCharge[]
  /** Capacités par `${poste}|${semaine}` pour le Δ % de l'axe charge. */
  capacites?: Map<string, number>
  strategy?: AllocationStrategy
}

function getOfDate(
  ofId: string,
  overrides: Map<string, OfOverride>,
  baseDate: Date | null
): Date | null {
  const ov = overrides.get(ofId)
  if (ov?.dateFin) {
    const d = new Date(ov.dateFin)
    d.setHours(0, 0, 0, 0)
    return isNaN(d.getTime()) ? null : d
  }
  return baseDate
}

export function evaluatePlanDiff(inputs: PlanDiffInputs, mutations: PlanMutation[]): PlanDiff {
  const before = evaluateOrderImpacts(
    inputs.demands,
    inputs.supplyFlows,
    inputs.nomenclatures,
    inputs.articles,
    inputs.overrides,
    inputs.window,
    inputs.mode,
    undefined,
    undefined,
    'date_besoin'
  )
  const mutated = applyMutations(inputs, mutations)
  const after = evaluateOrderImpacts(
    mutated.demands,
    mutated.supplyFlows,
    inputs.nomenclatures,
    inputs.articles,
    mutated.overrides,
    inputs.window,
    inputs.mode,
    undefined,
    undefined,
    inputs.strategy ?? 'date_besoin'
  )

  const verdicts: ApproVerdictEntry[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const ofFlows = inputs.supplyFlows.filter(
    (f) => f.direction === 'supply' && f.origin.type === 'of'
  )

  for (const f of ofFlows) {
    const ofId = (f.origin as any).id ?? ''
    const dateBefore = getOfDate(ofId, inputs.overrides, f.date)
    const dateAfter = getOfDate(ofId, mutated.overrides, f.date)

    if (!dateBefore || !dateAfter || dateBefore.getTime() === dateAfter.getTime()) continue

    const nom = inputs.nomenclatures.get(f.article)
    if (!nom) continue

    for (const comp of nom.components) {
      const compArticle = comp.componentArticle
      const articleDetail = inputs.articles.get(compArticle)
      const leadTime = articleDetail?.reorderDelay ?? 14

      const qty = comp.linkQuantity * f.quantity

      if (dateAfter.getTime() < dateBefore.getTime()) {
        const limitDate = new Date(today.getTime() + leadTime * 86400000)
        if (dateAfter.getTime() < limitDate.getTime()) {
          verdicts.push({
            composant: compArticle,
            numOf: ofId,
            verdict: 'inevitable',
            dateAvant: dateBefore.toISOString().slice(0, 10),
            dateApres: dateAfter.toISOString().slice(0, 10),
            quantite: qty,
            reorderDelay: leadTime,
          })
        } else {
          verdicts.push({
            composant: compArticle,
            numOf: ofId,
            verdict: 'recalable',
            dateAvant: dateBefore.toISOString().slice(0, 10),
            dateApres: dateAfter.toISOString().slice(0, 10),
            quantite: qty,
            reorderDelay: leadTime,
          })
        }
      } else if (dateAfter.getTime() > dateBefore.getTime()) {
        const hasReception = inputs.supplyFlows.some(
          (sf) => sf.direction === 'supply' && sf.origin.type === 'reception' && sf.article === compArticle
        )
        if (hasReception) {
          verdicts.push({
            composant: compArticle,
            numOf: ofId,
            verdict: 'dormant',
            dateAvant: dateBefore.toISOString().slice(0, 10),
            dateApres: dateAfter.toISOString().slice(0, 10),
            quantite: qty,
            reorderDelay: leadTime,
          })
        }
      }
    }
  }

  const diff: PlanDiff = {
    client: diffClient(before, after),
    appro: diffAppro(before, after),
    approVerdicts: verdicts,
    allocation: diffAllocation(before, after),
    charge: diffCharge(inputs.ofCharges ?? [], mutations, inputs.capacites),
    stats: { degradations: 0, ameliorations: 0 },
  }

  for (const entry of [...diff.client, ...diff.appro, ...diff.allocation]) {
    if (entry.sens === 'degradation') diff.stats.degradations++
    else diff.stats.ameliorations++
  }

  for (const v of verdicts) {
    if (v.verdict === 'inevitable' || v.verdict === 'dormant') {
      diff.stats.degradations++
    }
  }

  return diff
}
