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
  /** Qté cumulée des réceptions jusqu'à (et incluant) la déterminante. */
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
  statutCommande: OrderImpactResult['orders'][number]['statut'] | null
  joursRetard: number
  /** Première réception qui couvre la qté manquante — null si aucune couverture prévue. */
  reception: ShortageReception | null
  couverte: boolean
  verdict: 'couvert' | 'retard' | 'sans_couverture'
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
 * Cumule les réceptions futures d'un composant par date croissante jusqu'à couvrir
 * `qteManquante`. Retourne la réception DÉTERMINANTE (celle qui atteint le seuil) avec
 * la qté cumulée à ce point. `null` si aucune réception ou cumul insuffisant.
 */
export function resolveCoveringReception(
  receptions: ReceptionRecord[],
  qteManquante: number,
): ShortageReception | null {
  if (qteManquante <= 0 || receptions.length === 0) return null

  const sorted = [...receptions].sort((a, b) => a.date.getTime() - b.date.getTime())
  let cumul = 0
  for (const rec of sorted) {
    cumul += rec.quantity
    if (cumul >= qteManquante) {
      return {
        id: rec.id,
        supplier: rec.supplier,
        qty: rec.quantity,
        dateArrivee: rec.date.toISOString().slice(0, 10),
        qteCumulee: Math.round(cumul * 100) / 100,
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
 */
export function buildShortageRows(
  result: OrderImpactResult,
  receptionsByArticle: Map<string, ReceptionRecord[]>,
  articles: Map<string, Article>,
): ShortageResult {
  // Map inverse OF → commande (un OF rattaché à une commande porte son statut/retard).
  const ofToOrder = new Map<string, OrderRollup>()
  for (const order of result.orders) {
    for (const of of order.ofs) {
      // Un OF peut être alloué à plusieurs commandes : on garde la plus urgente
      // (date d'expédition la plus tôt) pour l'affichage de la ligne.
      const existing = ofToOrder.get(of.numOf)
      if (existing && existing.dateExpedition <= order.dateExpedition) continue
      ofToOrder.set(of.numOf, {
        numCommande: order.numCommande,
        client: order.client,
        dateExpedition: order.dateExpedition,
        statut: order.statut,
        joursRetard: order.joursRetard,
      })
    }
  }

  const descOf = (code: string) => articles.get(code)?.description ?? ''

  const rows: ShortageRow[] = []
  for (const of of result.ofs) {
    if (of.feasible !== false) continue
    const rollup = ofToOrder.get(of.numOf) ?? null

    for (const [component, qteManquante] of Object.entries(of.missingComponents)) {
      if (qteManquante <= 0) continue
      const reception = resolveCoveringReception(
        receptionsByArticle.get(component) ?? [],
        qteManquante,
      )

      let verdict: ShortageRow['verdict']
      if (!reception) verdict = 'sans_couverture'
      else if (rollup && rollup.joursRetard > 0) verdict = 'retard'
      else verdict = 'couvert'

      rows.push({
        component,
        componentDesc: descOf(component),
        qteManquante: Math.round(qteManquante * 100) / 100,
        numOf: of.numOf,
        articleParent: of.article,
        articleParentDesc: descOf(of.article),
        numCommande: rollup?.numCommande ?? null,
        client: rollup?.client ?? null,
        dateExpedition: rollup?.dateExpedition ?? null,
        statutCommande: rollup?.statut ?? null,
        joursRetard: rollup?.joursRetard ?? 0,
        reception,
        couverte: reception !== null,
        verdict,
      })
    }
  }

  // Tri par urgence : date d'expédition commande asc (nulls en fin), puis commande, composant.
  rows.sort((a, b) => {
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
