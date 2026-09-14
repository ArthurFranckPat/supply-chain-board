/**
 * Synthèse matières du séquenceur — pivot COMPOSANT des OF bloqués visibles à l'écran.
 *
 * Répond à : « le calcul de faisabilité dit que N OF sont bloqués — par QUOI, combien
 * il manque, et qu'est-ce qui rentre quand ? », sans avoir à ouvrir les OF un par un.
 *
 * Agrège des données déjà calculées, AUCUN accès X3 :
 *  1. `evaluateOrderImpacts()` → par OF : verdict + `missingComponents` (réf → qté manquante) ;
 *  2. `groupReceptionsByArticle()` → par article : les réceptions d'achat ouvertes.
 *
 * Différence avec `shortages.ts` (pivot de /ruptures) : ici le périmètre n'est PAS une
 * fenêtre serveur mais la liste d'OF que l'utilisateur a sous les yeux (filtres poste /
 * atelier / statut / dates appliqués côté client), et la maille est le COMPOSANT, pas le
 * couple composant × OF. Les deux pivots restent distincts : /ruptures rattache la commande
 * client et juge le retard vs l'expédition, ici on juge vs la date de DÉBUT de l'OF — c'est
 * la question du séquenceur (« puis-je lancer ? »), pas celle du service client.
 *
 * Périmètre v1 : composants ACHETÉS seulement (`supplyType === 'ACHAT'`). Les sous-ensembles
 * fabriqués manquants relèvent du lancement d'un OF, pas d'une relance fournisseur.
 */

import type { OrderImpactResult } from './order_impacts.js'
import type { ReceptionRecord } from './recursive_checker.js'
import type { Article } from './models/article.js'

/** Une réception d'achat attendue sur le composant. */
export interface SummaryReception {
  /** N° de commande d'achat (PORDERQ.POHNUM). */
  id: string
  supplier: string
  qty: number
  /** Date d'arrivée prévue (ISO yyyy-MM-dd). */
  dateIso: string
  /** Quantité cumulée des réceptions jusqu'à celle-ci incluse (ordre chronologique). */
  qteCumulee: number
  /** Attendue dans le passé et toujours pas reçue — la date annoncée n'est plus crédible. */
  enRetard: boolean
}

/** Un OF bloqué par le composant. */
export interface SummaryOf {
  numOf: string
  article: string
  designation: string | null
  /** Qté du composant qui manque POUR CET OF. */
  qteManquante: number
  /** Date de début prévue de l'OF = date à laquelle la matière doit être là. */
  besoinIso: string | null
}

export type SummaryVerdict = 'couvert' | 'retard' | 'sans_couverture'

export interface MaterialSummaryRow {
  component: string
  componentDesc: string
  /** Somme des manques sur tous les OF bloqués du périmètre. */
  qteManquante: number
  /** Date de besoin la plus proche parmi les OF bloqués (début d'OF). Null si aucune date. */
  besoinIso: string | null
  ofs: SummaryOf[]
  receptions: SummaryReception[]
  /** Somme des quantités de TOUTES les réceptions ouvertes du composant. */
  qteAttendue: number
  /** Fournisseur de la première réception attendue — '' si aucune. */
  fournisseur: string
  /**
   * Date à laquelle le cumul des réceptions couvre enfin `qteManquante`.
   * Null si les réceptions ouvertes n'y suffisent pas.
   */
  dateCouvertureIso: string | null
  verdict: SummaryVerdict
  /** Jours de retard de la couverture vs la date de besoin (0 si à temps / non couvert). */
  joursRetard: number
  /** Délai de réapprovisionnement X3 du composant, en jours — null si non renseigné. */
  delaiAppro: number | null
}

export interface MaterialSummaryStats {
  nbComposants: number
  nbOfBloques: number
  nbSansCouverture: number
  nbRetard: number
  /** OF bloqués dont AUCUN composant manquant n'est acheté (donc invisibles dans ce pivot). */
  nbOfHorsPerimetre: number
}

/** Périmètre : un OF visible à l'écran, avec sa date de début telle qu'affichée. */
export interface SummaryScopeOf {
  numOf: string
  besoinIso: string | null
}

const isoOf = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const daysBetweenIso = (a: string, b: string): number => {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Number.isNaN(ms) ? 0 : Math.round(ms / 86_400_000)
}

/**
 * Construit la synthèse. `scope` borne le calcul aux OF VISIBLES : un OF hors écran ne
 * doit ni gonfler les quantités manquantes ni consommer les réceptions affichées.
 */
export function buildMaterialShortageSummary(
  result: OrderImpactResult,
  scope: SummaryScopeOf[],
  receptionsByArticle: Map<string, ReceptionRecord[]>,
  articles: Map<string, Article>,
  opts: { todayIso?: string; purchasedOnly?: boolean } = {}
): { rows: MaterialSummaryRow[]; stats: MaterialSummaryStats } {
  const todayIso = opts.todayIso ?? isoOf(new Date())
  const purchasedOnly = opts.purchasedOnly !== false

  const besoinByOf = new Map<string, string | null>()
  for (const s of scope) besoinByOf.set(s.numOf, s.besoinIso)

  /** composant → OF bloqués (déduplication par numOf : un OF n'apparaît qu'une fois). */
  const byComponent = new Map<string, SummaryOf[]>()
  let nbOfBloques = 0
  let nbOfHorsPerimetre = 0

  for (const of of result.ofs) {
    if (of.feasible !== false) continue
    if (!besoinByOf.has(of.numOf)) continue
    nbOfBloques++

    const article = articles.get(of.article)
    let retenu = 0
    for (const [component, qteManquante] of Object.entries(of.missingComponents)) {
      if (qteManquante <= 0) continue
      // Filtre ACHAT : un composant absent du catalogue est ÉCARTÉ en mode « achetés
      // seulement ». Le défaut X3 côté ingestion est ACHAT (MFGFLG_0), donc un inconnu
      // ici est une référence sans fiche — pas une matière à relancer chez un fournisseur.
      if (purchasedOnly && articles.get(component)?.supplyType !== 'ACHAT') continue
      retenu++
      const arr = byComponent.get(component) ?? []
      arr.push({
        numOf: of.numOf,
        article: of.article,
        designation: article?.description ?? null,
        qteManquante,
        besoinIso: besoinByOf.get(of.numOf) ?? null,
      })
      byComponent.set(component, arr)
    }
    if (retenu === 0) nbOfHorsPerimetre++
  }

  const rows: MaterialSummaryRow[] = []
  for (const [component, ofs] of byComponent) {
    // OF les plus urgents d'abord : c'est l'ordre de lecture ET celui qui désigne la
    // date de besoin de la ligne.
    ofs.sort((a, b) => {
      if (a.besoinIso !== b.besoinIso) {
        if (!a.besoinIso) return 1
        if (!b.besoinIso) return -1
        return a.besoinIso < b.besoinIso ? -1 : 1
      }
      return a.numOf.localeCompare(b.numOf)
    })

    const qteManquante = ofs.reduce((s, o) => s + o.qteManquante, 0)
    const besoinIso = ofs.find((o) => o.besoinIso)?.besoinIso ?? null

    const brutes = [...(receptionsByArticle.get(component) ?? [])].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    )
    let cumul = 0
    const receptions: SummaryReception[] = brutes.map((r) => {
      cumul += r.quantity
      const dateIso = isoOf(r.date)
      return {
        id: r.id,
        supplier: r.supplier,
        qty: r.quantity,
        dateIso,
        qteCumulee: cumul,
        enRetard: dateIso < todayIso,
      }
    })
    // Date de couverture = première réception dont le CUMUL solde le manque. Cumul et non
    // quantité unitaire : trois livraisons partielles couvrent, la troisième fait foi.
    const dateCouvertureIso: string | null =
      receptions.find((r) => r.qteCumulee >= qteManquante)?.dateIso ?? null

    let verdict: SummaryVerdict
    let joursRetard = 0
    if (dateCouvertureIso === null) {
      verdict = 'sans_couverture'
    } else if (besoinIso && dateCouvertureIso > besoinIso) {
      verdict = 'retard'
      joursRetard = daysBetweenIso(besoinIso, dateCouvertureIso)
    } else if (dateCouvertureIso < todayIso) {
      // Couverture assurée par une réception attendue dans le PASSÉ et jamais arrivée :
      // sur le papier c'est couvert, dans l'atelier il n'y a rien. Le verdict doit le dire.
      verdict = 'retard'
      joursRetard = daysBetweenIso(dateCouvertureIso, todayIso)
    } else {
      verdict = 'couvert'
    }

    rows.push({
      component,
      componentDesc: articles.get(component)?.description ?? '',
      qteManquante: Math.round(qteManquante * 1000) / 1000,
      besoinIso,
      ofs,
      receptions,
      qteAttendue: Math.round(cumul * 1000) / 1000,
      fournisseur: receptions[0]?.supplier ?? '',
      dateCouvertureIso,
      verdict,
      joursRetard,
      delaiAppro: articles.get(component)?.reorderDelay ?? null,
    })
  }

  // Le plus grave d'abord : sans couverture, puis retard, puis couvert ; à verdict égal,
  // la date de besoin la plus proche, puis le plus grand nombre d'OF bloqués.
  const RANK: Record<SummaryVerdict, number> = { sans_couverture: 0, retard: 1, couvert: 2 }
  rows.sort((a, b) => {
    if (RANK[a.verdict] !== RANK[b.verdict]) return RANK[a.verdict] - RANK[b.verdict]
    if (a.besoinIso !== b.besoinIso) {
      if (!a.besoinIso) return 1
      if (!b.besoinIso) return -1
      return a.besoinIso < b.besoinIso ? -1 : 1
    }
    if (a.ofs.length !== b.ofs.length) return b.ofs.length - a.ofs.length
    return a.component.localeCompare(b.component)
  })

  return {
    rows,
    stats: {
      nbComposants: rows.length,
      nbOfBloques,
      nbSansCouverture: rows.filter((r) => r.verdict === 'sans_couverture').length,
      nbRetard: rows.filter((r) => r.verdict === 'retard').length,
      nbOfHorsPerimetre,
    },
  }
}

/** Couverture d'un composant manquant d'un OF : quand la matière rentre, et de qui. */
export interface ComponentCoverage {
  /** Date d'arrivée de la réception qui solde le manque. Null = rien en commande. */
  dateIso: string | null
  supplier: string
  /** N° de commande d'achat déterminante. */
  poId: string
}

export interface OfCoverage {
  /**
   * Date à partir de laquelle TOUS les composants manquants de l'OF sont rentrés — donc la
   * date à laquelle il devient lançable. Null si au moins un composant n'a aucune couverture.
   */
  readyIso: string | null
  byComponent: Record<string, ComponentCoverage>
}

/** Un OF bloqué, dans l'ordre où la file le sert. */
export interface CoverageOfInput {
  numOf: string
  /** Date d'expédition de la commande servie — ordonne la file (null = servi en dernier). */
  shipmentIso: string | null
  statutNum: number
  missingComponents: Record<string, number>
}

/**
 * Attribue les réceptions d'achat aux OF bloqués, dans l'ORDRE DE LA FILE.
 *
 * Même allocation séquentielle que le pivot `/ruptures` (`resolveCoveringReception` avec
 * `alreadyConsumed`) : une réception ne peut pas couvrir deux OF à la fois. L'OF servi en
 * premier prend la marchandise ; le suivant attend la livraison d'après.
 *
 * L'ordre DOIT être celui du moteur de contention (expédition, statut, numéro), sinon le
 * tooltip d'un badge annoncerait une date que le panneau Matières contredit.
 *
 * Volontairement pas de date de besoin ici : on répond « quand ça rentre », pas « est-ce
 * à temps » — ce verdict-là appartient au panneau, qui connaît les buffers.
 */
export function buildCoverageByOf(
  ofs: CoverageOfInput[],
  receptionsByArticle: Map<string, ReceptionRecord[]>,
  opts: {
    overdueMinQty?: number
    todayIso?: string
    resolve: (
      receptions: ReceptionRecord[],
      qteManquante: number,
      o: { alreadyConsumed: number; overdueMinQty?: number; todayIso?: string }
    ) => { id: string; supplier: string; dateArrivee: string } | null
  }
): Record<string, OfCoverage> {
  const ordered = [...ofs].sort((a, b) => {
    const ta = a.shipmentIso ?? '9999-12-31'
    const tb = b.shipmentIso ?? '9999-12-31'
    if (ta !== tb) return ta < tb ? -1 : 1
    if (a.statutNum !== b.statutNum) return a.statutNum - b.statutNum
    return a.numOf.localeCompare(b.numOf)
  })

  const consumed = new Map<string, number>()
  const out: Record<string, OfCoverage> = {}

  for (const of of ordered) {
    const byComponent: Record<string, ComponentCoverage> = {}
    let readyIso: string | null = null
    let uncovered = false

    for (const [component, qte] of Object.entries(of.missingComponents)) {
      if (qte <= 0) continue
      const alreadyConsumed = consumed.get(component) ?? 0
      const rec = opts.resolve(receptionsByArticle.get(component) ?? [], qte, {
        alreadyConsumed,
        ...(opts.overdueMinQty !== undefined ? { overdueMinQty: opts.overdueMinQty } : {}),
        ...(opts.todayIso !== undefined ? { todayIso: opts.todayIso } : {}),
      })
      // La part réservée est décomptée même sans réception couvrante : l'OF suivant ne doit
      // pas se voir attribuer une marchandise que celui-ci attend déjà.
      consumed.set(component, alreadyConsumed + qte)

      if (!rec) {
        byComponent[component] = { dateIso: null, supplier: '', poId: '' }
        uncovered = true
        continue
      }
      byComponent[component] = {
        dateIso: rec.dateArrivee,
        supplier: rec.supplier,
        poId: rec.id,
      }
      // L'OF n'est lançable qu'au dernier composant rentré.
      if (readyIso === null || rec.dateArrivee > readyIso) readyIso = rec.dateArrivee
    }

    out[of.numOf] = { readyIso: uncovered ? null : readyIso, byComponent }
  }

  return out
}
