/**
 * Pivot composant-centrique des ruptures (issue #15).
 *
 * Agrège des données déjà calculées — AUCUN nouveau calcul de fond, AUCUN accès X3 :
 * 1. `evaluateOrderImpacts()` (app/domain/order-impacts.ts) fournit, par OF évalué,
 *    son verdict de faisabilité + ses `missingComponents` (composant → qté manquante),
 *    et, par commande, le statut / joursRetard + les OF alloués.
 * 2. `buildReceptionsMap()` (app/services/feasibility-loader-adapter.ts) fournit les
 *    réceptions d'achat attendues par article composant.
 *
 * Sortie : une ligne par couple (composant manquant × OF bloqué), enrichie de la
 * commande cliente rattachée (rollup) et de la PREMIÈRE réception qui couvre la qté
 * manquante (cumul des réceptions futures par date croissante).
 */

import type { OrderImpactResult } from './order-impacts.js'
import type { ReceptionRecord } from './recursive-checker.js'
import type { Article } from './models/article.js'

export interface ShortageReception {
  /** N° commande d'achat (PORDERQ.POHNUM). */
  id: string
  supplier: string
  /** Qté de CETTE réception. */
  qty: number
  /** Date d'arrivée prévue de la réception déterminante (celle qui couvre le besoin). */
  dateArrivee: string
  /** Qté cumulée des réceptions jusqu'à (et incluant) la déterminante, nette de la part
   *  déjà réservée par des lignes plus urgentes (consommation séquentielle). */
  qteCumulee: number
}

export interface ShortageRow {
  /** Composant manquant (article ACHAT/FAB). */
  component: string
  componentDesc: string
  qteManquante: number
  /** OF dont la réalisation est bloquée par ce composant. */
  numOf: string
  /** Article (PF) produit par l'OF. */
  articleParent: string
  articleParentDesc: string
  /** Commande cliente rattachée à l'OF (rollup) — null si OF non rattaché. */
  numCommande: string | null
  client: string | null
  dateExpedition: string | null
  /** Autres commandes clientes allouées au même OF (au-delà de la plus urgente affichée). */
  autresCommandes: string[]
  statutCommande: OrderImpactResult['orders'][number]['statut'] | null
  /** Retard commande (stock strict/qc) issu du moteur de faisabilité. */
  joursRetard: number
  /**
   * Retard imputable à la réception : nb de jours entre la date d'expédition commande
   * et la date d'arrivée de la réception couvrante, si celle-ci arrive APRÈS l'expédition.
   * 0 si à temps, sans réception, ou sans date d'expédition (OF non rattaché).
   *
   * Pour une réception EN RETARD (overdue : attendue dans le passé, non reçue), vaut
   * aujourd'hui − date attendue (jours de retard déjà cumulés).
   */
  joursRetardReception: number
  /** Vrai si la réception couvrante est en retard de livraison (attendue dans le passé, non reçue). */
  overdue: boolean
  /** Première réception qui couvre la qté manquante — null si aucune couverture prévue. */
  reception: ShortageReception | null
  couverte: boolean
  /**
   * Date de BESOIN du composant = date d'expédition − buffer fabrication (défaut 2 j).
   * Référence de ponctualité de la réception : les dates de jalonnement OF (STRDAT/ENDDAT)
   * sont jugées non fiables (décision métier 2026-07-06) — on remonte depuis l'engagement
   * client. Null si OF non rattaché à une commande.
   */
  dateBesoin: string | null
  /**
   * OFs du pool produisant ce composant (composant FABRIQUÉ couvert par un OF fils
   * potentiel). Vide si aucun OF fils dans la fenêtre.
   */
  sousEnsembleOfs: string[]
  /**
   * `sous_ensemble` : composant FABRIQUÉ sans réception d'achat — la couverture passe
   * par un OF fils (à lancer, ou déjà présent dans sousEnsembleOfs), pas par un PO.
   * Avant : faux « sans_couverture » systématique (la couverture ne lit que PORDERQ).
   */
  verdict: 'couvert' | 'retard' | 'sans_couverture' | 'sous_ensemble'
}

export interface ShortageResult {
  rows: ShortageRow[]
  stats: {
    nbRuptures: number
    nbCouvertes: number
    nbSansCouverture: number
  }
}

/** Infos commande remontées sur la ligne via la map inverse OF → commande. */
interface OrderRollup {
  numCommande: string
  client: string
  dateExpedition: string
  statut: OrderImpactResult['orders'][number]['statut']
  joursRetard: number
}

/**
 * Reverse peg OF → commande (contremarque X3), fallback quand le matcher n'a pas alloué
 * l'OF (commande hors fenêtre d'échéance). Pas de statut/retard (pas calculé par le moteur).
 */
export interface ShortageOfPeg {
  numCommande: string
  client: string | null
  /** Date d'expédition ISO (YYYY-MM-DD) ou null. */
  dateExpedition: string | null
}

/**
 * Buffer fabrication par défaut : temps maxi jugé nécessaire pour produire l'OF une fois
 * les composants reçus (décision métier : « max 2 jours de fabrication »). La réception
 * doit arriver au plus tard à expédition − buffer pour être « à temps ».
 */
export const DEFAULT_FABRICATION_BUFFER_DAYS = 2

/** Décale une date ISO (YYYY-MM-DD) de `days` jours calendaires (UTC, sans dérive TZ). */
export function addDaysIso(iso: string, days: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(t)) return iso
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/** Nb de jours calendaires entre deux dates ISO (YYYY-MM-DD), en UTC pour éviter tout décalage. */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * ISO (YYYY-MM-DD) du jour en composantes LOCALES — pas toISOString(), qui repasse en UTC
 * et recule d'un jour entre minuit et 1-2h en fuseau UTC+1/+2 (même piège que le scoping
 * getLive, cf. order_impacts_loader.isoLocal). Sert de référence « aujourd'hui » pour les
 * verdicts overdue.
 */
export function isoLocalDay(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

export interface CoveringReceptionOptions {
  /**
   * Qté du composant déjà « réservée » par des lignes plus urgentes (consommation
   * séquentielle des réceptions entre lignes). Le cumul doit atteindre
   * alreadyConsumed + qteManquante pour couvrir CETTE ligne.
   */
  alreadyConsumed?: number
  /**
   * Plancher anti « reliquat fantôme » (issue #43, point 1) : une réception OVERDUE
   * (attendue dans le passé, non reçue) ne compte dans le cumul que si sa qté ≥ plancher —
   * les reliquats morts (visserie, petites pièces) ne couvrent plus faussement un petit
   * manque. Les réceptions FUTURES comptent toujours. 0 = désactivé.
   */
  overdueMinQty?: number
  /** Référence « aujourd'hui » (ISO local) pour qualifier l'overdue. Défaut : isoLocalDay(). */
  todayIso?: string
}

/**
 * Cumule les réceptions d'un composant par date croissante (futures ET overdue via le
 * lookback 90j) jusqu'à couvrir `qteManquante` (au-delà de `alreadyConsumed`). Retourne la
 * réception DÉTERMINANTE (celle qui atteint le seuil) avec la qté cumulée NETTE (part
 * restant à cette ligne après les lignes plus urgentes). `null` si aucune réception ou
 * cumul insuffisant.
 *
 * PARTAGÉE par les deux vues : table Ruptures (buildShortageRows ci-dessous) + ETA goulots
 * proactif (suivi_controller.ts buildProactiveDisplay). Tout durcissement ici corrige les deux.
 */
export function resolveCoveringReception(
  receptions: ReceptionRecord[],
  qteManquante: number,
  opts: CoveringReceptionOptions = {},
): ShortageReception | null {
  if (qteManquante <= 0 || receptions.length === 0) return null
  const { alreadyConsumed = 0, overdueMinQty = 0 } = opts
  const todayIso = opts.todayIso ?? isoLocalDay()

  const eligible =
    overdueMinQty > 0
      ? receptions.filter(
          (r) => r.date.toISOString().slice(0, 10) >= todayIso || r.quantity >= overdueMinQty,
        )
      : receptions
  if (eligible.length === 0) return null

  const seuil = alreadyConsumed + qteManquante
  const sorted = [...eligible].sort((a, b) => a.date.getTime() - b.date.getTime())
  let cumul = 0
  for (const rec of sorted) {
    cumul += rec.quantity
    if (cumul >= seuil) {
      return {
        id: rec.id,
        supplier: rec.supplier,
        qty: rec.quantity,
        dateArrivee: rec.date.toISOString().slice(0, 10),
        qteCumulee: Math.round((cumul - alreadyConsumed) * 100) / 100,
      }
    }
  }
  return null
}

/**
 * Pivote le résultat de faisabilité en lignes (composant × OF bloqué) avec rollup commande
 * et réception couvrante.
 *
 * Périmètre : TOUS les OF bloqués de la fenêtre (`result.ofs` avec `feasible === false`),
 * y compris ceux sans commande cliente rattachée (numCommande = null).
 *
 * Les réceptions sont consommées SÉQUENTIELLEMENT entre lignes, dans l'ordre d'urgence
 * (date d'expédition asc) : deux OF manquant le même composant ne peuvent pas être
 * « couverts » par la même réception — la 2e ligne ne voit que le reste.
 */
export function buildShortageRows(
  result: OrderImpactResult,
  receptionsByArticle: Map<string, ReceptionRecord[]>,
  articles: Map<string, Article>,
  ofPegs: Map<string, ShortageOfPeg> = new Map(),
  opts: { todayIso?: string; overdueMinQty?: number; fabricationBufferDays?: number } = {},
): ShortageResult {
  const todayIso = opts.todayIso ?? isoLocalDay()
  const overdueMinQty = opts.overdueMinQty ?? 0
  const fabricationBufferDays = opts.fabricationBufferDays ?? DEFAULT_FABRICATION_BUFFER_DAYS

  // OFs du pool par article produit — sert à repérer l'OF fils d'un composant FABRIQUÉ.
  const ofsByArticle = new Map<string, string[]>()
  for (const of of result.ofs) {
    if (!of.article) continue
    const list = ofsByArticle.get(of.article) ?? []
    list.push(of.numOf)
    ofsByArticle.set(of.article, list)
  }
  // Map inverse OF → commandes (un OF rattaché à une commande porte son statut/retard).
  // On ne rattache QUE les vraies commandes clientes : une prévision ne constitue pas un
  // engagement client → parler de « rupture commande » pour une prévision n'a pas de sens.
  // Un OF peut être alloué à PLUSIEURS commandes : la plus urgente (date d'expédition la
  // plus tôt) porte la ligne, les autres sont exposées dans `autresCommandes`.
  const ofToOrders = new Map<string, OrderRollup[]>()
  for (const order of result.orders) {
    if (order.nature !== 'commande') continue
    for (const of of order.ofs) {
      const list = ofToOrders.get(of.numOf) ?? []
      if (!list.some((o) => o.numCommande === order.numCommande)) {
        list.push({
          numCommande: order.numCommande,
          client: order.client,
          dateExpedition: order.dateExpedition,
          statut: order.statut,
          joursRetard: order.joursRetard,
        })
      }
      ofToOrders.set(of.numOf, list)
    }
  }
  for (const list of ofToOrders.values()) {
    list.sort((a, b) => (a.dateExpedition < b.dateExpedition ? -1 : a.dateExpedition > b.dateExpedition ? 1 : 0))
  }

  const descOf = (code: string) => articles.get(code)?.description ?? ''

  // ── Passe 1 : squelettes de lignes (sans réception) ──
  interface PendingRow {
    component: string
    qteManquante: number
    numOf: string
    articleParent: string
    rollup: OrderRollup | null
    numCommande: string | null
    client: string | null
    dateExpedition: string | null
    joursRetard: number
    autresCommandes: string[]
  }
  const pending: PendingRow[] = []
  for (const of of result.ofs) {
    if (of.feasible !== false) continue
    const rollups = ofToOrders.get(of.numOf) ?? []
    const rollup = rollups[0] ?? null
    // Fallback contremarque quand le matcher n'a pas alloué l'OF (commande hors fenêtre).
    const peg = !rollup ? (ofPegs.get(of.numOf) ?? null) : null
    const numCommande = rollup?.numCommande ?? peg?.numCommande ?? null

    // Une SUGGESTION (statut suggéré = 3) non rattachée à une commande = proposition MRP
    // spéculative, pas un engagement client → pas une rupture à suivre. Les OF affermis
    // /planifiés (1/2) restent visibles même orphelins (vraie rupture de production).
    if (numCommande === null && of.statutNum === 3) continue

    for (const [component, qteManquante] of Object.entries(of.missingComponents)) {
      if (qteManquante <= 0) continue
      pending.push({
        component,
        qteManquante,
        numOf: of.numOf,
        articleParent: of.article,
        rollup,
        numCommande,
        client: rollup?.client ?? peg?.client ?? null,
        dateExpedition: rollup?.dateExpedition ?? peg?.dateExpedition ?? null,
        joursRetard: rollup?.joursRetard ?? 0,
        autresCommandes: rollups.slice(1).map((o) => o.numCommande),
      })
    }
  }

  // Tri par urgence AVANT l'allocation des réceptions : date d'expédition commande asc
  // (nulls en fin), puis commande, composant. C'est cet ordre qui détermine quelle ligne
  // consomme les réceptions en premier — et c'est aussi l'ordre d'affichage.
  pending.sort((a, b) => {
    if (a.dateExpedition !== b.dateExpedition) {
      if (!a.dateExpedition) return 1
      if (!b.dateExpedition) return -1
      return a.dateExpedition < b.dateExpedition ? -1 : 1
    }
    const ca = a.numCommande ?? ''
    const cb = b.numCommande ?? ''
    if (ca !== cb) return ca.localeCompare(cb)
    return a.component.localeCompare(b.component)
  })

  // ── Passe 2 : allocation séquentielle des réceptions + verdict ──
  // Chaque ligne réserve sa qté manquante sur le composant, couverte ou non : les
  // réceptions vont d'abord aux lignes les plus urgentes.
  const consumedByComponent = new Map<string, number>()
  const rows: ShortageRow[] = []
  for (const p of pending) {
    const alreadyConsumed = consumedByComponent.get(p.component) ?? 0
    const reception = resolveCoveringReception(
      receptionsByArticle.get(p.component) ?? [],
      p.qteManquante,
      { alreadyConsumed, overdueMinQty, todayIso },
    )
    consumedByComponent.set(p.component, alreadyConsumed + p.qteManquante)

    // Date de BESOIN = expédition − buffer fabrication : la réception doit laisser le
    // temps de produire. On ne se réfère PAS aux dates de jalonnement OF (STRDAT/ENDDAT,
    // non fiables — décision métier), mais à l'engagement client remonté du buffer.
    const dateBesoin = p.dateExpedition ? addDaysIso(p.dateExpedition, -fabricationBufferDays) : null

    // Retard imputable à la réception. Deux cas :
    //  - EN RETARD (overdue) : la couvrante était attendue dans le passé (retard de
    //    livraison, PO non reçue). Lateness = aujourd'hui − date attendue (retard déjà
    //    cumulé). Cas le plus urgent — la pièce aurait dû être là.
    //  - À VENIR TARD : la couvrante arrive après la date de BESOIN (expé − buffer).
    let joursRetardReception = 0
    let overdue = false
    if (reception) {
      if (reception.dateArrivee < todayIso) {
        overdue = true
        joursRetardReception = daysBetweenIso(reception.dateArrivee, todayIso)
      } else if (dateBesoin && reception.dateArrivee > dateBesoin) {
        joursRetardReception = daysBetweenIso(dateBesoin, reception.dateArrivee)
      }
    }

    // Composant FABRIQUÉ sans réception : la couverture passe par un OF fils, pas par un
    // PO — verdict dédié au lieu d'un faux « sans_couverture » (PORDERQ ne peut pas couvrir).
    const isFabrique = articles.get(p.component)?.supplyType === 'FABRICATION'
    const sousEnsembleOfs = isFabrique ? (ofsByArticle.get(p.component) ?? []) : []

    // Le retard COMMANDE (p.joursRetard, moteur stock) ne pollue plus le verdict ligne :
    // cause potentiellement sans rapport avec la réception de CE composant. Il reste
    // exposé sur la ligne comme contexte commande.
    let verdict: ShortageRow['verdict']
    if (!reception) verdict = isFabrique ? 'sous_ensemble' : 'sans_couverture'
    else if (overdue || joursRetardReception > 0) verdict = 'retard'
    else verdict = 'couvert'

    rows.push({
      component: p.component,
      componentDesc: descOf(p.component),
      qteManquante: Math.round(p.qteManquante * 100) / 100,
      numOf: p.numOf,
      articleParent: p.articleParent,
      articleParentDesc: descOf(p.articleParent),
      numCommande: p.numCommande,
      client: p.client,
      dateExpedition: p.dateExpedition,
      autresCommandes: p.autresCommandes,
      statutCommande: p.rollup?.statut ?? null,
      joursRetard: p.joursRetard,
      joursRetardReception,
      overdue,
      reception,
      couverte: reception !== null,
      dateBesoin,
      sousEnsembleOfs,
      verdict,
    })
  }

  let nbSansCouverture = 0
  for (const r of rows) if (!r.couverte) nbSansCouverture++

  return {
    rows,
    stats: {
      nbRuptures: rows.length,
      nbCouvertes: rows.length - nbSansCouverture,
      nbSansCouverture,
    },
  }
}
