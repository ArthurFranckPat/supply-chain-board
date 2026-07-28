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
import type { FeasibilityOptions } from './stock_state.js'
import type { MfgMaterialInput } from './of_feasibility.js'
import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import {
  evaluateOrderImpacts,
  type OrderImpactResult,
  type OrderImpactRow,
} from './order_impacts.js'
import type { OfOverride } from './planning_board.js'
import type { AllocationStrategy } from './of_conso.js'
import { isPurchaseArticle } from './rules.js'
import {
  DEFAULT_HOURS_PER_DAY,
  DEFAULT_LOGISTICS_BUFFER_DAYS,
  fabricationDaysFromHours,
} from './shortages.js'

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
  /** true si la commande sort du plan muté (shift_demand hors fenêtre). */
  disparue: boolean
  sens: DiffSens
}

/** Demande injectée (inject_demand) — l'hypothèse testée. Son verdict CTP est un
 *  constat neutre (réponse à la demande), pas un impact signé : exclu du bilan. */
export interface SujetEntry {
  numCommande: string
  ligne: string | null
  article: string
  client: string
  /** Verdict de servabilité évalué dans le plan muté (CTP). */
  statut: OrderImpactRow['statut']
  /** Retard de couverture vs la date de besoin testée. */
  joursRetard: number
  /** Date de besoin testée (ISO), null si non retrouvée dans les mutations. */
  date: string | null
  /** Quantité testée, null si non retrouvée dans les mutations. */
  quantite: number | null
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

/**
 * Réaction d'offre synthétisée pour une demande injectée (issue #58, réouverture).
 *
 * Une commande client ne consomme rien en direct : elle DÉCLENCHE un ordre. Sans cet
 * ordre virtuel, `inject_demand` ne posait qu'une demande nue → aucune empreinte
 * composants, axes appro/allocation/charge structurellement à 0, et un CTP tautologique
 * (« la commande qu'on vient de créer n'a pas de couverture »).
 *
 * v1 actée : nomenclature 1 niveau (la descente des sous-ensembles fabriqués reste celle
 * du moteur de rupture), lot économique ignoré (qté OF = qté demandée), poste = gamme de
 * l'article.
 */
export interface VirtualSupplyEntry {
  /** Id du flux virtuel — `VOF-<id demande>` pour un OF, `VPO-<id demande>` pour un achat. */
  id: string
  /** Demande injectée à l'origine de cette réaction. */
  demandeId: string
  ligne: string | null
  article: string
  quantite: number
  /** 'of' = fabriqué (consomme la nomenclature) ; 'achat' = réappro (le manque = le produit). */
  type: 'of' | 'achat'
  /** Date à laquelle l'ordre doit être LANCÉ / la commande d'achat PASSÉE (ISO). */
  dateDebut: string
  /** Date de mise à disposition retenue (ISO) — besoin moins le buffer logistique. */
  dateFin: string
  /** Délai retenu, en jours : charge gamme convertie (fabriqué) ou réappro article (achat). */
  delai: number
  /** true si la date de lancement/passation est déjà passée → l'ordre ne tient plus. */
  lancementDepasse: boolean
  /** Poste de charge (fabriqué, gamme connue) — null sinon. */
  poste: string | null
  /** Heures de charge ajoutées sur ce poste (fabriqué, gamme connue) — null sinon. */
  heures: number | null
  /** Besoins composants niveau 1 de l'ordre virtuel + manquant constaté dans le plan muté. */
  composants: Array<{ article: string; besoin: number; manquant: number }>
}

export interface ApproVerdictEntry {
  composant: string
  numOf: string
  verdict: 'inevitable' | 'recalable' | 'dormant'
  dateAvant: string
  dateApres: string
  quantite: number
  reorderDelay: number
  /** true si le besoin n'existait pas avant (composant d'un ordre virtuel, #58). */
  nouveau?: boolean
  /**
   * Manquant du composant dans le plan muté (0 pour un `dormant`, qui n'est pas une
   * rupture). Sert à rappeler que le verdict repose sur un manque CONSTATÉ par le
   * moteur, pas sur la seule arithmétique date + délai.
   */
  manquant: number
}

export interface PlanDiff {
  client: ClientDiffEntry[]
  /** Hypothèses injectées (inject_demand) + verdict CTP : constat neutre, hors bilan. */
  sujet: SujetEntry[]
  /** Ordres virtuels déclenchés par les demandes injectées — la réaction d'offre (#58). */
  offreVirtuelle: VirtualSupplyEntry[]
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

// ---------------------------------------------------------------------------
// Réaction d'offre virtuelle (issue #58) — besoin → OF / réappro
// ---------------------------------------------------------------------------

/** Gamme condensée d'un article : où ça charge, et combien d'heures par unité. */
export interface ArticleRouting {
  poste: string
  heuresParUnite: number
}

export interface VirtualSupplyContext {
  articles: Map<string, Article>
  nomenclatures: Map<string, Nomenclature>
  /** Gammes par article — sans elles, pas de poste ni d'axe charge sur l'ordre virtuel. */
  routings?: Map<string, ArticleRouting>
  hoursPerDay?: number
  /** Injectable pour les tests ; défaut = aujourd'hui minuit. */
  today?: Date
}

export interface VirtualSupplyPlan {
  entries: VirtualSupplyEntry[]
  /** Flows d'offre à ajouter au plan muté (OF virtuels uniquement). */
  flows: Flow[]
  /** `${demandeId}#${ligne ?? ''}` → n° d'OF virtuel, posé en contremarque sur la demande. */
  pegByDemand: Map<string, string>
  /** Jours de fabrication des OF virtuels — même rôle que `engine.fabricationDaysByOf`. */
  fabricationDays: Map<string, number>
  /** Charge des OF virtuels, pour l'axe charge du diff. */
  charges: OfCharge[]
}

const EMPTY_VIRTUAL_SUPPLY: VirtualSupplyPlan = {
  entries: [],
  flows: [],
  pegByDemand: new Map(),
  fabricationDays: new Map(),
  charges: [],
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000)
}

/**
 * Synthétise, pour chaque `inject_demand`, l'ordre que cette commande DÉCLENCHERAIT.
 *
 *  - article fabriqué → OF virtuel (statut planifié) posé dans les flows d'offre : c'est
 *    lui qui consomme la nomenclature, donc lui qui allume les axes appro (nouveaux
 *    manques), allocation et charge, et qui rend le CTP significatif ;
 *  - article acheté → PAS de flux d'offre. Injecter une réception virtuelle masquerait
 *    justement le signal recherché (le matcher compte les réceptions comme du stock, sans
 *    regarder leur date) : la demande resterait « servie » alors que le manque EST le
 *    produit. L'entrée `type: 'achat'` porte le délai de réappro et la date de passation
 *    requise ; la demande, elle, ressort non couverte — ce qui est le constat juste.
 */
export function synthesizeVirtualSupply(
  mutations: PlanMutation[],
  ctx: VirtualSupplyContext
): VirtualSupplyPlan {
  const injections = mutations.filter(
    (m): m is Extract<PlanMutation, { type: 'inject_demand' }> => m.type === 'inject_demand'
  )
  if (injections.length === 0) return EMPTY_VIRTUAL_SUPPLY

  const today =
    ctx.today ??
    (() => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    })()
  const hoursPerDay = ctx.hoursPerDay ?? DEFAULT_HOURS_PER_DAY

  const plan: VirtualSupplyPlan = {
    entries: [],
    flows: [],
    pegByDemand: new Map(),
    fabricationDays: new Map(),
    charges: [],
  }

  for (const m of injections) {
    const article = ctx.articles.get(m.article) ?? null
    const bom = ctx.nomenclatures.get(m.article)
    // Achat = pas d'OF à lancer, la couverture passe par un réappro. Tout le reste
    // (fabriqué, article inconnu) déclenche un OF — sans nomenclature, il produit sans
    // rien consommer, ce qui reste plus juste que de le faire disparaître.
    const besoin = parseIso(m.date)

    if (isPurchaseArticle(article)) {
      const delai = article?.reorderDelay ?? 14
      const passation = addDays(besoin, -delai)
      plan.entries.push({
        id: `VPO-${m.id}`,
        demandeId: m.id,
        ligne: m.ligne ?? null,
        article: m.article,
        quantite: m.quantity,
        type: 'achat',
        dateDebut: toIsoDay(passation),
        dateFin: toIsoDay(besoin),
        delai,
        lancementDepasse: passation.getTime() < today.getTime(),
        poste: null,
        heures: null,
        composants: [],
      })
      continue
    }

    const routing = ctx.routings?.get(m.article) ?? null
    const heures = routing ? Math.round(routing.heuresParUnite * m.quantity * 10) / 10 : null
    const fabDays =
      heures !== null
        ? fabricationDaysFromHours(heures, hoursPerDay)
        : Math.max(1, article?.reorderDelay ?? 1)

    // L'OF doit être TERMINÉ avant l'expédition : même buffer logistique que le calcul de
    // retard d'`evaluateOrderImpacts`, sinon un OF calé pile sur le besoin sortirait en
    // retard systématique.
    const dateFin = addDays(besoin, -DEFAULT_LOGISTICS_BUFFER_DAYS)
    const dateDebut = addDays(dateFin, -fabDays)
    const numOf = `VOF-${m.id}`

    plan.pegByDemand.set(`${m.id}#${m.ligne ?? ''}`, numOf)
    plan.flows.push({
      article: m.article,
      quantity: m.quantity,
      direction: 'supply',
      date: dateFin,
      origin: {
        type: 'of',
        id: numOf,
        status: 2,
        statutLabel: 'Virtuel',
        typeOf: null,
        typeOfLabel: null,
        designation: article?.description ?? null,
        launched: m.quantity,
        reservePour: m.id,
      },
    })
    plan.fabricationDays.set(numOf, fabDays)
    if (routing && heures) {
      plan.charges.push({ numOf, poste: routing.poste, dateFin: toIsoDay(dateFin), heures })
    }

    const composants = new Map<string, number>()
    for (const entry of bom?.components ?? []) {
      const qty = requiredQuantity(entry, m.quantity)
      if (qty <= 0) continue
      composants.set(entry.componentArticle, (composants.get(entry.componentArticle) ?? 0) + qty)
    }

    plan.entries.push({
      id: numOf,
      demandeId: m.id,
      ligne: m.ligne ?? null,
      article: m.article,
      quantite: m.quantity,
      type: 'of',
      dateDebut: toIsoDay(dateDebut),
      dateFin: toIsoDay(dateFin),
      delai: fabDays,
      lancementDepasse: dateDebut.getTime() < today.getTime(),
      poste: routing?.poste ?? null,
      heures,
      composants: [...composants].map(([a, besoinQty]) => ({
        article: a,
        besoin: besoinQty,
        manquant: 0,
      })),
    })
  }

  return plan
}

/**
 * Applique N mutations à un plan. Composable : chaque mutation opère sur la
 * sortie de la précédente. shift_of réutilise le mécanisme OfOverride (le
 * moteur d'impact lit déjà les overrides pour les dates effectives).
 *
 * `virtual` (issue #58) : réaction d'offre pré-synthétisée. Ses OF virtuels sont ajoutés
 * à l'offre et pointés en contremarque depuis leur demande injectée — hard peg, pour que
 * la virtuelle ne se fasse pas voler son propre OF par une commande réelle du même article.
 */
export function applyMutations(
  inputs: PlanInputs,
  mutations: PlanMutation[],
  virtual: VirtualSupplyPlan = EMPTY_VIRTUAL_SUPPLY
): PlanInputs {
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
              contremarque: virtual.pegByDemand.get(`${m.id}#${m.ligne ?? ''}`) ?? null,
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

  return { demands, supplyFlows: [...supplyFlows, ...virtual.flows], overrides }
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

function diffClient(
  before: OrderImpactResult,
  after: OrderImpactResult
): { client: ClientDiffEntry[]; sujet: Array<Omit<SujetEntry, 'date' | 'quantite'>> } {
  const beforeByKey = new Map(before.orders.map((r) => [orderKey(r), r]))
  const afterByKey = new Map(after.orders.map((r) => [orderKey(r), r]))
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()])

  const client: ClientDiffEntry[] = []
  // Hypothèse injectée (inject_demand) : son verdict CTP est la RÉPONSE à la demande
  // testée, pas un impact signé sur le plan → monte en `sujet`, hors bilan (flux ADV).
  const sujet: Array<Omit<SujetEntry, 'date' | 'quantite'>> = []
  for (const key of keys) {
    const b = beforeByKey.get(key)
    const a = afterByKey.get(key)
    if (!b) {
      sujet.push({
        numCommande: a!.numCommande,
        ligne: a!.ligne ?? null,
        article: a!.article,
        client: a!.client,
        statut: a!.statut,
        joursRetard: a!.joursRetard,
      })
      continue
    }
    const changed = !a || b.statut !== a.statut || b.joursRetard !== a.joursRetard
    if (!changed) continue

    const base = {
      numCommande: b.numCommande,
      ligne: b.ligne ?? null,
      article: b.article,
      client: b.client,
      statutAvant: b.statut,
      statutApres: a?.statut ?? null,
      joursRetardAvant: b.joursRetard,
      joursRetardApres: a?.joursRetard ?? 0,
      deltaJours: (a?.joursRetard ?? 0) - b.joursRetard,
      disparue: !a,
    }
    client.push({ ...base, sens: signClient(base) })
  }
  return { client, sujet }
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
 *
 * `virtualCharges` (issue #58) : charge des OF virtuels — de la charge NETTE ajoutée,
 * sans bucket d'origine à décharger.
 */
export function diffCharge(
  ofCharges: OfCharge[],
  mutations: PlanMutation[],
  capacites?: Map<string, number>,
  virtualCharges: OfCharge[] = []
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

  for (const c of virtualCharges) {
    const key = `${c.poste}|${mondayOf(c.dateFin)}`
    deltas.set(key, (deltas.get(key) ?? 0) + c.heures)
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

/**
 * Passe-plat vers `evaluateOrderImpacts` : les entrées « métier » que le board réel
 * fournit déjà (`order_impacts_loader`) et sans lesquelles le diff n'évaluerait PAS
 * le même plan que celui affiché — faisabilité MFGMAT réelle, avancement atelier,
 * charge gamme pour le calcul de retard.
 *
 * Absent (fixtures, tests) → repli théorique : BOM complet, 1 jour de fabrication
 * par OF. C'est le comportement historique, correct pour un test, faux pour l'écran.
 */
export interface PlanDiffEngineInputs {
  precomputedFeasibility?: Map<
    string,
    {
      feasible: boolean | null
      missingComponents: Record<string, number>
      qcComponents?: Record<string, number>
    }
  >
  avancementByOf?: Map<string, { estDebuté: boolean; qtyRealisee?: number }>
  mfgMaterialsByOf?: Map<string, MfgMaterialInput[]>
  fabricationDaysByOf?: Map<string, number>
}

export interface PlanDiffInputs extends PlanInputs {
  nomenclatures: Map<string, Nomenclature>
  articles: Map<string, Article>
  window: { from: Date; to: Date }
  mode?: FeasibilityOptions['mode']
  /** Charges OF (poste + heures) pour l'axe charge. Absent → axe vide. */
  ofCharges?: OfCharge[]
  /** Capacités par `${poste}|${semaine}` pour le Δ % de l'axe charge. */
  capacites?: Map<string, number>
  /**
   * Gammes condensées par article (#58) — poste + heures/unité. Sans elles, un OF virtuel
   * reste sans poste : pas d'axe charge, et son délai de fabrication retombe sur le délai
   * article. Fournies par `order_impacts_loader` (référentiel gamme déjà chargé).
   */
  routings?: Map<string, ArticleRouting>
  /** Heures ouvrées par jour pour convertir la charge gamme en jours de fabrication. */
  hoursPerDay?: number
  strategy?: AllocationStrategy
  /** Entrées moteur du pipeline appelant — cf. `PlanDiffEngineInputs`. */
  engine?: PlanDiffEngineInputs
  /**
   * Baseline DÉJÀ évaluée par l'appelant (`ctx.result` du loader). Fournie, elle évite
   * de recalculer le plan actuel — et garantit surtout que le « avant » du diff est
   * exactement le plan que l'utilisateur a sous les yeux, pas une seconde évaluation
   * aux paramètres approchants.
   */
  before?: OrderImpactResult
}

export interface PlanDiffEvaluation {
  diff: PlanDiff
  before: OrderImpactResult
  after: OrderImpactResult
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
    return Number.isNaN(d.getTime()) ? null : d
  }
  return baseDate
}

/**
 * Verdicts de calage appro (issue #59) — CONSTAT sur les composants d'un OF déplacé.
 *
 * Règle de recevabilité : un besoin qui avance ne devient un verdict QUE si le moteur
 * constate un manquant sur ce composant dans le plan muté. Sans ce nettage, tout OF
 * avancé sortait « rupture inévitable » sur l'intégralité de sa nomenclature, stock
 * plein compris — le panneau devenait illisible et faux.
 *
 * Caveat délai : `reorderDelay` vient d'ITMMASTER (PRPLTI/MFGLTI). Ces champs sont
 * très majoritairement vides côté X3 → la valeur est le plus souvent le repli de
 * `static_sync_service` (14 j achat / 10 j fabrication). La frontière inevitable ↔
 * recalable est donc indicative tant que le référentiel n'est pas rempli.
 */
function approVerdicts(
  inputs: PlanDiffInputs,
  mutatedOverrides: Map<string, OfOverride>,
  after: OrderImpactResult,
  virtual: VirtualSupplyPlan
): ApproVerdictEntry[] {
  const verdicts: ApproVerdictEntry[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const missingAfter = missingByComponent(after)

  // Ordres virtuels (#58) : leurs besoins composants sont NEUFS — ils passent par la même
  // machinerie de verdicts (#59) qu'un besoin avancé, la date de référence étant le
  // lancement de l'OF virtuel (c'est là que les matières doivent être là).
  for (const entry of virtual.entries) {
    if (entry.type !== 'of') continue
    const lancement = parseIso(entry.dateDebut)
    for (const comp of entry.composants) {
      const manquant = missingAfter.get(comp.article)?.ofs.get(entry.id) ?? 0
      if (manquant <= 0) continue
      const leadTime = inputs.articles.get(comp.article)?.reorderDelay ?? 14
      const limite = addDays(today, leadTime)
      verdicts.push({
        composant: comp.article,
        numOf: entry.id,
        verdict: lancement.getTime() < limite.getTime() ? 'inevitable' : 'recalable',
        dateAvant: entry.dateDebut,
        dateApres: entry.dateDebut,
        quantite: comp.besoin,
        reorderDelay: leadTime,
        manquant,
        nouveau: true,
      })
    }
  }

  // Index réceptions par article — l'ancien `.some()` sur tout `supplyFlows` était
  // dans la double boucle OF × composants.
  const receptionsByArticle = new Map<string, Date[]>()
  for (const sf of inputs.supplyFlows) {
    if (sf.direction !== 'supply' || sf.origin.type !== 'reception' || !sf.date) continue
    const arr = receptionsByArticle.get(sf.article) ?? []
    arr.push(sf.date)
    receptionsByArticle.set(sf.article, arr)
  }

  for (const f of inputs.supplyFlows) {
    if (f.direction !== 'supply' || f.origin.type !== 'of') continue
    const ofId = (f.origin as { id?: string }).id ?? ''
    const dateBefore = getOfDate(ofId, inputs.overrides, f.date)
    const dateAfter = getOfDate(ofId, mutatedOverrides, f.date)
    if (!dateBefore || !dateAfter || dateBefore.getTime() === dateAfter.getTime()) continue

    const nom = inputs.nomenclatures.get(f.article)
    if (!nom) continue

    const avance = dateAfter.getTime() < dateBefore.getTime()

    for (const comp of nom.components) {
      const compArticle = comp.componentArticle
      const leadTime = inputs.articles.get(compArticle)?.reorderDelay ?? 14
      const quantite = comp.linkQuantity * f.quantity
      const base = {
        composant: compArticle,
        numOf: ofId,
        dateAvant: toIsoDay(dateBefore),
        dateApres: toIsoDay(dateAfter),
        quantite,
        reorderDelay: leadTime,
      }

      if (avance) {
        // Besoin avancé : verdict seulement si le composant manque réellement après
        // mutation. Couvert par le stock/les réceptions → rien à re-caler, rien à dire.
        const manquant = missingAfter.get(compArticle)?.ofs.get(ofId) ?? 0
        if (manquant <= 0) continue
        const limite = new Date(today.getTime() + leadTime * 86400000)
        verdicts.push({
          ...base,
          verdict: dateAfter.getTime() < limite.getTime() ? 'inevitable' : 'recalable',
          manquant,
        })
      } else {
        // Besoin repoussé : une réception déjà attendue AVANT la nouvelle date de
        // besoin arrive pour rien à sa date. Une réception postérieure, elle, reste
        // à sa place — la signaler serait du bruit.
        const dormante = (receptionsByArticle.get(compArticle) ?? []).some(
          (d) => d.getTime() >= today.getTime() && d.getTime() < dateAfter.getTime()
        )
        if (!dormante) continue
        verdicts.push({ ...base, verdict: 'dormant', manquant: 0 })
      }
    }
  }
  return verdicts
}

function toIsoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export function evaluatePlanDiff(inputs: PlanDiffInputs, mutations: PlanMutation[]): PlanDiff {
  return evaluatePlanDiffDetailed(inputs, mutations).diff
}

/**
 * Même diff, mais rend aussi les deux évaluations — l'appelant qui a besoin de
 * statistiques agrégées (bilan de scénario, comparateur) n'a plus à relancer le
 * moteur pour les obtenir.
 */
export function evaluatePlanDiffDetailed(
  inputs: PlanDiffInputs,
  mutations: PlanMutation[]
): PlanDiffEvaluation {
  const engine = inputs.engine ?? {}
  const before =
    inputs.before ??
    evaluateOrderImpacts(
      inputs.demands,
      inputs.supplyFlows,
      inputs.nomenclatures,
      inputs.articles,
      inputs.overrides,
      inputs.window,
      inputs.mode,
      engine.precomputedFeasibility,
      engine.avancementByOf,
      'date_besoin',
      engine.mfgMaterialsByOf,
      engine.fabricationDaysByOf
    )
  // Réaction d'offre des demandes injectées (#58) : l'OF (ou la commande d'achat) que
  // la commande virtuelle déclencherait. Sans elle, le diff est aveugle sur le geste ADV.
  const virtual = synthesizeVirtualSupply(mutations, {
    articles: inputs.articles,
    nomenclatures: inputs.nomenclatures,
    routings: inputs.routings,
    hoursPerDay: inputs.hoursPerDay,
  })

  const mutated = applyMutations(inputs, mutations, virtual)
  // Jours de fabrication des OF virtuels ajoutés aux entrées moteur — mais seulement si
  // l'appelant en fournit déjà : la map absente est un CONTRAT (repli `effFin` dans le
  // calcul de retard), la remplir à moitié changerait de mode de calcul en douce.
  const afterFabricationDays =
    engine.fabricationDaysByOf && virtual.fabricationDays.size > 0
      ? new Map([...engine.fabricationDaysByOf, ...virtual.fabricationDays])
      : engine.fabricationDaysByOf
  const after = evaluateOrderImpacts(
    mutated.demands,
    mutated.supplyFlows,
    inputs.nomenclatures,
    inputs.articles,
    mutated.overrides,
    inputs.window,
    inputs.mode,
    engine.precomputedFeasibility,
    engine.avancementByOf,
    inputs.strategy ?? 'date_besoin',
    engine.mfgMaterialsByOf,
    afterFabricationDays
  )

  // Manquants constatés sur chaque ordre virtuel — le « quels composants sont captés ».
  const missingAfter = missingByComponent(after)
  for (const entry of virtual.entries) {
    for (const comp of entry.composants) {
      comp.manquant = missingAfter.get(comp.article)?.ofs.get(entry.id) ?? 0
    }
  }

  const verdicts = approVerdicts(inputs, mutated.overrides, after, virtual)

  const { client, sujet: sujetRaw } = diffClient(before, after)

  // Identité des hypothèses injectées : date/quantité testées (en-tête CTP) + retrait de
  // la virtuelle de l'axe allocation (sa ligne « gagne » est le pendant tautologique du
  // « perd » constaté sur la commande réelle lésée — ce dernier reste, lui, signé).
  const virtualIds = new Set<string>()
  const injectInfo = new Map<string, { date: string; quantity: number }>()
  for (const m of mutations) {
    if (m.type !== 'inject_demand') continue
    virtualIds.add(m.id)
    injectInfo.set(`${m.id}#${m.ligne ?? ''}`, { date: m.date, quantity: m.quantity })
  }
  const sujet: SujetEntry[] = sujetRaw.map((s) => {
    const info = injectInfo.get(`${s.numCommande}#${s.ligne ?? ''}`)
    return { ...s, date: info?.date ?? null, quantite: info?.quantity ?? null }
  })

  const diff: PlanDiff = {
    client,
    sujet,
    offreVirtuelle: virtual.entries,
    appro: diffAppro(before, after),
    approVerdicts: verdicts,
    allocation: diffAllocation(before, after).filter((e) => !virtualIds.has(e.numCommande)),
    charge: diffCharge(inputs.ofCharges ?? [], mutations, inputs.capacites, virtual.charges),
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

  return { diff, before, after }
}
