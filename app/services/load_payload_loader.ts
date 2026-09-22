/**
 * Projection de charge long terme (variante 3 « Charge par ligne »).
 *
 * Agrège les OF (ORDERS, tous statuts 1/2/3 via boardDataset, cache SWR partagé)
 * en charge horaire par poste de charge (workstation gamme) × période, ventilée
 * Ferme/Planifié/Suggéré. Deux mailles servies côte à côte : mensuelle et hebdo.
 * Calcul pur côté serveur ; la présentation (mini-graphes + détail) est cliente.
 *
 * Extrait de `LoadController.index` (issue #49) : seul offender du controller (249 l.
 * sur 360), assemblage capacité/charge inline.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import boardDataset from '#services/board_dataset'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { OrderLineForLoad } from '#repositories/order_line_repository'
import {
  hoursForQuantity,
  groupGammeByArticle,
  type GammeOperation,
} from '#app/domain/models/gamme'
import { addDays, atMidnight, isoDay, isoWeek, mondayOf } from '#app/utils/dates'
import { computeAvancement, resteAProduire, type OfAvancement } from '#app/domain/of_avancement'
import type { Workstation } from '#app/domain/models/workstation'
import { capDay, chargeHoursWithEfficiency, isOpenDay } from '#app/domain/capacity'
import {
  atelierLabel,
  atelierCategoryFromPosteNature,
  buildPosteNatureByWorkstation,
  type AtelierCategory,
} from '#app/domain/atelier'
import capacityCalendar from '#services/capacity_calendar_service'
import staticSync from '#services/static_sync_service'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import type { NomenclatureEntry } from '#app/domain/models/nomenclature'
import {
  chargeSegment,
  collectBom,
  collectChargeArticles,
  explodeAndNet,
  ofSegment,
  type ChargeNeed,
  type ChargeOrderLine,
  type DepthCutStats,
} from '#app/domain/charge_explosion'
import type { Flow } from '#app/domain/models/flow'
import { demandHorizonEnd, isForecastInsideDemandHorizon } from '#app/domain/demand_horizon'
import { retardBucketKey, weekWindow } from '#app/domain/charge_window'

/**
 * Shapes émis vers la page Inertia. Miroir côté client : inertia-react/lib/load/types.ts
 * (même convention que SuiviController ↔ inertia-react/lib/suivi/types.ts).
 */
interface LoadPeriod {
  f: number
  p: number
  s: number
  /** Charge induite (besoin brut depth-1) depuis des commandes fermes — vue commande. */
  fi: number
  /** Charge induite (besoin brut depth-1) depuis des prévisions — vue commande. */
  si: number
}
interface LoadLine {
  code: string
  name: string
  color: string
  /** Articles produits sur le poste (« CODE désignation »), pour la recherche client. */
  articles: string[]
  monthly: LoadPeriod[]
  weekly: LoadPeriod[]
  /** Charge NETTE (besoin − stock strict/CQ), parallèle à monthly/weekly. */
  monthlyNet: LoadPeriod[]
  weeklyNet: LoadPeriod[]
  /** RESTE À PRODUIRE (net − en-cours non déclaré) — 3e cran de la bascule, défaut. */
  monthlyReste: LoadPeriod[]
  weeklyReste: LoadPeriod[]
  /**
   * Charge en PIÈCES (quantités opérées), mêmes crans et mêmes mailles que les
   * heures ci-dessus. La quantité n'est PAS `heures × cadence` : l'efficience
   * poste (`chargeHoursWithEfficiency`) pondère le temps, jamais le nombre de
   * pièces, et un arrondi d'heures ne se remultiplie pas. Le serveur émet donc
   * la série telle qu'elle a été sommée, à côté de celle en heures.
   *
   * Pas d'équivalent pièces pour `capacity` : un temps de poste n'est pas une
   * quantité. La bascule Heures/Pièces masque donc le plafond de capacité et la
   * saturation visuelle (cf. page `scheduler/load`), elle ne les convertit pas.
   */
  monthlyQty: LoadPeriod[]
  weeklyQty: LoadPeriod[]
  monthlyNetQty: LoadPeriod[]
  weeklyNetQty: LoadPeriod[]
  monthlyResteQty: LoadPeriod[]
  weeklyResteQty: LoadPeriod[]
  /** Capacité nette (heures) par bucket, alignée sur monthly/weekly (issue #35). */
  capacity: { monthly: number[]; weekly: number[] }
  /** Atelier (STOLOC) du poste + métadonnées de filtre (issue #36). */
  atelier: string
  atelierLabel: string
  workCenter: string
  category: AtelierCategory
}

const NB_MONTHS = 6

/** Libellé mensuel court capitalisé sans point : « Juil », « Août ». */
const monthLabel = (d: Date): string => {
  const s = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const monthKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}`

/** Palette de pastilles par poste (cyclique, parité avec les maquettes design). */
const PALETTE = [
  '#5b7d4e',
  '#2f4858',
  '#b8862c',
  '#8b5cf6',
  '#8c7d66',
  '#a8431f',
  '#3f7d7a',
  '#9a3320',
]

/**
 * Horizon canonique de la vue charge : N mois pleins depuis le 1er du mois de
 * `start`. Exporté pour que le détail d'un bucket vise EXACTEMENT la même
 * fenêtre que l'agrégat — recopier ce calcul, c'est se garantir un décalage le
 * jour où NB_MONTHS bouge.
 */
export function chargeHorizon(start?: string): { monthStart: Date; horizonEnd: Date } {
  const monthStart = atMidnight(start ? new Date(start) : new Date())
  monthStart.setDate(1)
  const horizonEnd = new Date(monthStart)
  horizonEnd.setMonth(monthStart.getMonth() + NB_MONTHS)
  horizonEnd.setDate(0)
  horizonEnd.setHours(23, 59, 59, 999)
  return { monthStart, horizonEnd }
}

/**
 * Bornes d'un bucket, depuis sa clé telle que produite par le payload :
 * `YYYY-M` en maille mensuelle, ISO du lundi en maille hebdo. Retourne null si
 * la clé est illisible (URL bricolée) — l'appelant répond 400 plutôt que de
 * servir un intervalle par défaut, qui afficherait une table plausible mais fausse.
 */
export function chargeBucketRange(
  gran: 'month' | 'week',
  key: string
): { from: Date; to: Date; label: string } | null {
  if (gran === 'month') {
    const m = /^(\d{4})-(\d{1,2})$/.exec(key)
    if (!m) return null
    const year = Number(m[1])
    const month = Number(m[2]) - 1
    if (month < 0 || month > 11) return null
    const from = new Date(year, month, 1, 0, 0, 0, 0)
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999)
    return { from, to, label: `${monthLabel(from)} ${year}` }
  }
  // Bucket « Retard » (`début~fin`, cf. `retardBucketKey`) : les semaines
  // écoulées fondues en une barre.
  const r = /^(\d{4})-(\d{2})-(\d{2})~(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (r) {
    const from = new Date(Number(r[1]), Number(r[2]) - 1, Number(r[3]), 0, 0, 0, 0)
    const to = new Date(Number(r[4]), Number(r[5]) - 1, Number(r[6]), 23, 59, 59, 999)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return null
    const next = addDays(to, 1)
    const nd = String(next.getDate()).padStart(2, '0')
    const nm = String(next.getMonth() + 1).padStart(2, '0')
    return { from, to, label: `Retard · avant le ${nd}/${nm}/${next.getFullYear()}` }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) return null
  const from = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  if (Number.isNaN(from.getTime())) return null
  const to = addDays(from, 6)
  to.setHours(23, 59, 59, 999)
  const dd = String(from.getDate()).padStart(2, '0')
  const mm = String(from.getMonth() + 1).padStart(2, '0')
  return { from, to, label: `S${isoWeek(from)} · semaine du ${dd}/${mm}` }
}

/**
 * Jour de rattachement d'un besoin dans les buckets : si le poste est fermé le
 * jour du besoin (facteur calendrier nul, ou capacité sentinelle X3), la charge
 * remonte au dernier jour ouvré du poste. Sans ça, un besoin un samedi alimente
 * un bucket dont la capacité exclut ce jour → saturation gonflée (4.1).
 *
 * Borné à l'horizon : un décalage qui en sort laisse la date d'origine, pour ne
 * pas faire disparaître la charge d'un besoin du 1er du mois tombant un samedi.
 * Exporté pour que le DÉTAIL d'un bucket décale exactement comme la barre.
 */
export function chargeDay(
  wst: string,
  date: Date,
  calendar: { factor(w: Workstation, iso: string): number } | null,
  wstByCode: Map<string, Workstation>,
  monthStart: Date,
  horizonEnd: Date
): Date {
  const w = wstByCode.get(wst)
  if (!calendar || !w) return date
  let d = date
  for (let i = 0; i < 14; i++) {
    if (isOpenDay(w, d, calendar.factor(w, isoDay(d)))) break
    d = addDays(d, -1)
  }
  return d < monthStart || d > horizonEnd ? date : d
}

const emptyPeriod = (): LoadPeriod => ({ f: 0, p: 0, s: 0, fi: 0, si: 0 })
const round = (p: LoadPeriod): LoadPeriod => ({
  f: Math.round(p.f),
  p: Math.round(p.p),
  s: Math.round(p.s),
  fi: Math.round(p.fi),
  si: Math.round(p.si),
})

/** Sous-ensemble d'un OF suffisant pour calculer son reste à produire. */
export type OfQty = Pick<ManufacturingOrder, 'numOf' | 'quantity' | 'quantityLaunched'>
/** OF porteur d'en-cours : OfQty + l'article qui reçoit la déduction. */
export type EncoursOf = OfQty & { article: string }

/** Entrées brutes du calcul de charge, partagées agrégat ↔ détail. */
export interface ChargeInputs {
  mos: ManufacturingOrder[]
  /**
   * OF démarrés AVANT l'horizon, encore ouverts, bornés aux articles ayant de la
   * demande dans la fenêtre (matching delta #99). Ils ne s'affichent nulle part
   * (la vue OF est bornée à `mos`) mais leurs pièces pointées non déclarées
   * doivent réduire la demande — sinon le backlog des mois précédents est
   * invisible du cran « reste » (D2).
   */
  deltaMos: EncoursOf[]
  orderLines: OrderLineForLoad[]
  gammeMap: Map<string, GammeOperation[]>
  workstations: Workstation[]
  wstLabels: Map<string, string>
  bomByParent: Map<string, NomenclatureEntry[]>
  /**
   * Avancement atelier des OF démarrés (pointages MFGOPE). Vit ICI et pas dans
   * chaque loader : l'agrégat et le détail doivent déduire les mêmes pièces, sinon
   * le total de la table cesse de retomber sur la hauteur de la barre.
   */
  avancementByOf: Map<string, OfAvancement>
  /** Catégorie article (préfixe PF / SF) — nature poste montage/fabrication. */
  categoryByArticle: Map<string, string>
  /** Désignation de l'article, par code article. */
  descriptions?: Map<string, string>
  demandHorizonByArticle: Map<string, { value: number; unit: number }>
  /**
   * Overrides de date de ligne de commande (`order_line_overrides`), clé
   * `numCommande#ligne` → ISO.
   *
   * /charge était le dernier consommateur de la demande à ne PAS les lire :
   * une ligne re-datée bougeait sur /approvisionnement, /programme et le suivi,
   * mais pas sur le graphe de charge ni son détail journalier — donc pas sur
   * l'écran qui motive le déplacement. Ils vivent dans les `ChargeInputs` pour
   * que l'agrégat et le détail partagent EXACTEMENT le même jeu, snapshot figé
   * compris : la table ne peut pas se retrouver datée autrement que la barre.
   */
  lineDateOverrides: Map<string, string>
  x3Error: string | null
}

/**
 * Heures de charge d'un OF, pièces déjà pointées déduites.
 *
 * Le commentaire historique de la vue OF (« déjà nets via le CBN → brut = net »)
 * était faux : X3 ne nette `RMNEXTQTY` qu'à la déclaration finale de stock sur une
 * large part des OF (mesuré en prod : 1313 OF fermes démarrés sur 1405 ont encore
 * EXTQTY === RMNEXTQTY). Sans déduction, un poste est facturé du travail qu'il a
 * déjà physiquement produit — sur le bucket courant et le retard, pas sur l'horizon
 * lointain (un OF démarré est à sa date de début ou en retard).
 *
 * Ce n'est PAS du netting par stock : la correction porte sur la quantité restante,
 * donc elle vaut pour `brut` comme pour `net` — la vue OF garde brut = net et n'a
 * toujours pas de bascule.
 */
export function ofResteAProduire(mo: OfQty, avancementByOf: Map<string, OfAvancement>): number {
  return resteAProduire(
    mo.quantity,
    mo.quantityLaunched,
    avancementByOf.get(mo.numOf)?.qtyRealisee ?? 0
  )
}

export function ofChargeHours(
  mo: ManufacturingOrder,
  gamme: GammeOperation | undefined,
  avancementByOf: Map<string, OfAvancement>
): number {
  return hoursForQuantity(gamme, ofResteAProduire(mo, avancementByOf))
}

/**
 * Lecture des sources du calcul de charge (OF, lignes de demande, référentiel,
 * nomenclature) sur [monthStart, horizonEnd].
 *
 * Extrait du factory de payload pour que le DÉTAIL d'un bucket reparte
 * exactement des mêmes entrées : une table de détail dont le total ne retombe
 * pas sur la hauteur de la barre est pire que pas de table du tout. Tous les
 * appels passent par les caches SWR de boardDataset — le détail ne déclenche
 * donc aucune requête X3 supplémentaire.
 */
export async function fetchChargeInputs(
  monthStart: Date,
  horizonEnd: Date,
  force = false
): Promise<ChargeInputs> {
  const toYYYYMMDD = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${da}`
  }

  let mos: ManufacturingOrder[] = []
  let orderLines: OrderLineForLoad[] = []
  let gammeOps: GammeOperation[] = []
  let workstations: Workstation[] = []
  const bomByParent = new Map<string, NomenclatureEntry[]>()
  let x3Error: string | null = null

  const categoryByArticle = new Map<string, string>()
  const descriptions = new Map<string, string>()
  const demandHorizonByArticle = new Map<string, { value: number; unit: number }>()
  const [refR, ordR, olR, nomR, artR, ovR] = await Promise.allSettled([
    boardDataset.getReferential(force),
    boardDataset.getOrdersForWindow(monthStart, horizonEnd, force),
    boardDataset.getOrderLinesForLoad(toYYYYMMDD(monthStart), toYYYYMMDD(horizonEnd), force),
    staticSync.readNomenclatures(),
    boardDataset.getArticles(),
    new OrderLineOverrideStore().getMap(),
  ])
  // Table locale : un échec de lecture ne doit pas vider la page, il ramène
  // simplement les dates X3 — état d'avant le branchement, jamais une erreur.
  const lineDateOverrides = ovR.status === 'fulfilled' ? ovR.value : new Map<string, string>()
  if (artR.status === 'fulfilled') {
    for (const a of artR.value) {
      categoryByArticle.set(a.code, a.category ?? '')
      if (a.description) descriptions.set(a.code, a.description)
      if (a.demandHorizon) demandHorizonByArticle.set(a.code, a.demandHorizon)
    }
  }
  if (refR.status === 'fulfilled') {
    gammeOps = refR.value.gamme
    workstations = refR.value.workstations ?? []
  } else {
    x3Error = (refR.reason as Error).message
  }
  if (ordR.status === 'fulfilled') {
    mos = ordR.value.mos
  } else {
    x3Error = x3Error ?? (ordR.reason as Error).message
  }
  if (olR.status === 'fulfilled') {
    orderLines = olR.value
  } else {
    x3Error = x3Error ?? (olR.reason as Error).message
  }
  // BOM (composants FABRIQUÉS) pour la charge induite (vue commande).
  // Mode heures : achetés exclus (pas de poste) — cf. `collectBom`.
  if (nomR.status === 'fulfilled') {
    for (const [parent, entries] of collectBom(nomR.value)) bomByParent.set(parent, entries)
  }

  const wstLabels = new Map<string, string>()
  for (const g of gammeOps) {
    if (g.workstation) wstLabels.set(g.workstation, g.workstationLabel || g.workstation)
  }

  // Pointages atelier — restreints aux OF qui PEUVENT en avoir : fermes et dont la
  // date de début est passée. Un OF planifié/suggéré, ou qui démarre dans 3 mois,
  // n'a aucun pointage : l'inclure ne ferait que gonfler la requête MFGOPE sur tout
  // l'horizon 6 mois et fragmenter la clé de cache pour rien.
  const today = atMidnight(new Date())
  const startedOfs = mos
    .filter((mo) => mo.status === 1 && mo.startDate && atMidnight(mo.startDate) <= today)
    .map((mo) => mo.numOf)

  // D2 : OF démarrés AVANT l'horizon mais encore ouverts. `getOrdersForWindow`
  // filtre STRDAT ≥ monthStart, donc le backlog des mois précédents échappait au
  // pool d'en-cours. La lecture existe déjà pour le matching (#99, ~14 lignes) ;
  // on la branche ici et on lit aussi leurs pointages.
  const deltaFlows = await boardDataset
    .getOrdersForMatchingDelta(monthStart, horizonEnd, force)
    .catch(() => [] as Flow[])
  const deltaMos: EncoursOf[] = []
  for (const f of deltaFlows) {
    if (f.origin.type !== 'of' || f.origin.status !== 1) continue
    deltaMos.push({
      numOf: f.origin.id,
      article: f.article,
      quantity: f.quantity,
      quantityLaunched: f.origin.launched ?? 0,
    })
  }
  for (const mo of deltaMos) if (!startedOfs.includes(mo.numOf)) startedOfs.push(mo.numOf)

  // Un échec MFGOPE ne doit pas vider la page : sans avancement on retombe sur le
  // comportement d'avant (charge pleine), pas sur une charge nulle.
  const operations = await boardDataset.getOperations(startedOfs).catch(() => [])
  const avancementByOf = computeAvancement(operations)

  return {
    mos,
    deltaMos,
    orderLines,
    gammeMap: groupGammeByArticle(gammeOps),
    workstations,
    wstLabels,
    bomByParent,
    avancementByOf,
    categoryByArticle,
    descriptions,
    demandHorizonByArticle,
    lineDateOverrides,
    x3Error,
  }
}

/** Format d'une date d'override : tout le reste est ignoré (saisie bricolée). */
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Date retenue pour une ligne de demande : l'override local s'il existe, sinon
 * la date X3.
 *
 * Mêmes clé et garde que `material_plan_loader` et `poste_engagement_loader` —
 * un second mécanisme de surcharge ferait diverger deux écrans qui décrivent la
 * même ligne. Les PRÉVISIONS sont exclues : elles n'ont pas de ligne de commande
 * à re-dater, leur `numCommande` n'est qu'un identifiant de prévision.
 */
export function orderLineDate(
  l: Pick<OrderLineForLoad, 'nature' | 'numCommande' | 'ligne' | 'dateLivraison'>,
  overrides: Map<string, string>
): Date {
  if (l.nature === 'COMMANDE' && l.numCommande) {
    const ov = overrides.get(`${l.numCommande}#${l.ligne ?? ''}`)
    if (ov && ISO_RE.test(ov)) return atMidnight(new Date(ov))
  }
  return atMidnight(l.dateLivraison)
}

/**
 * Lignes de demande au format explosion (date normalisée + provenance).
 *
 * Exporté pour le lissage de charge (`load_smoothing_builder`), qui doit
 * exploser EXACTEMENT la même demande, aux mêmes dates d'override, pour borner
 * l'avance par la matière. Deux normalisations de la demande, et la borne
 * matière parlerait d'un plan que /charge n'affiche pas.
 */
export function chargeOrderLines(inputs: ChargeInputs): ChargeOrderLine[] {
  return inputs.orderLines.map((l) => ({
    article: l.article,
    quantite: l.quantite,
    date: orderLineDate(l, inputs.lineDateOverrides),
    nature: (l.nature === 'PREVISION' ? 'prevision' : 'ferme') as 'prevision' | 'ferme',
    source: {
      numCommande: l.numCommande,
      ligne: l.ligne,
      client: l.clientCode,
      pfArticle: l.article,
    },
  }))
}

/**
 * Stock strict+CQ des articles de charge. C'est la SEULE entrée du netting lue
 * hors des `ChargeInputs` (boardDataset, cache tournant) : elle doit être figée
 * avec le reste dans le snapshot graphe ↔ détail, sinon la table pouvait encore
 * diverger de la barre d'un rotation de cache de stock.
 */
export async function computeChargeStock(inputs: ChargeInputs): Promise<Map<string, number>> {
  // D13 : parcours d'articles seul — pas de ventilation horaire ni d'émission par poste.
  const chargeArticles = collectChargeArticles(
    chargeOrderLines(inputs),
    inputs.bomByParent,
    inputs.gammeMap
  )
  const stockByArticle = new Map<string, number>()
  if (chargeArticles.length > 0) {
    const flows = await boardDataset.getStock(chargeArticles).catch(() => [] as Flow[])
    for (const f of flows) {
      if (f.origin.type !== 'stock') continue
      if (f.origin.subType === 'strict' || f.origin.subType === 'qc') {
        stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
      }
    }
  }
  return stockByArticle
}

/**
 * Vue commande : explosion + netting en UNE passe descendante (`explodeAndNet`).
 *
 * Le net d'un parent redescend sur ses enfants (D1), le pool est consommé par
 * besoin et non par opération (D4), et le stock part au ferme avant la prévision
 * à date égale (D3). `stats` remonte la troncature depth-4 (D9).
 *
 * ponytail: snapshot stock « maintenant » étalé sur l'horizon, FIFO/article.
 * Pas de réceptions/OF en cours, pas d'offset lead time (choix métier).
 *
 * `pinnedStock` : stock figé par le snapshot du payload (`computeChargeStock`)
 * — le détail d'un bucket le re-passe pour nettinguer exactement comme la barre.
 */
export async function computeChargeNeeds(
  inputs: ChargeInputs,
  pinnedStock?: Map<string, number>,
  stats?: DepthCutStats,
  applyDemandHorizon = true
): Promise<ChargeNeed[]> {
  const stockByArticle = pinnedStock ?? (await computeChargeStock(inputs))
  const orderLines = applyDemandHorizon
    ? inputs.orderLines.filter(
        (line) =>
          line.nature !== 'PREVISION' ||
          !isForecastInsideDemandHorizon(
            { demandHorizon: inputs.demandHorizonByArticle.get(line.article) },
            line.dateLivraison
          )
      )
    : inputs.orderLines
  return explodeAndNet(
    chargeOrderLines({ ...inputs, orderLines }),
    inputs.bomByParent,
    inputs.gammeMap,
    stockByArticle,
    buildEncoursByArticle(inputs),
    stats
  )
}

/**
 * En-cours de fabrication INVISIBLE du stock, par article : les pièces déjà
 * produites sur un OF démarré mais pas encore déclarées en stock.
 *
 * Ces pièces n'existent nulle part pour le calcul : ni en stock (pas déclarées),
 * ni dans aucun flux que le netting regarde. La vue commande annonçait donc
 * comme « à produire » du travail physiquement fait — cas AR2602603 L1000 :
 * 640 demandés alors que 390 étaient sorties de l'opération 10 de F326-02020.
 *
 * `mo.quantity − resteAProduire(...)` et non `qtyRealisee` brut : c'est le même
 * garde `EXTQTY === RMNEXTQTY` que la vue OF. Dès qu'un OF déclare, X3 nette
 * RMNEXTQTY et les pièces entrent en stock — la différence retombe alors à 0 et
 * la passe stock les compte, sans double déduction. Vérifié sur les deux
 * branches : F326-02020 → 640−250 = 390 (non déclaré, à déduire ici) ;
 * F326-02036 → 1236−1236 = 0 (480 déclarées, déjà dans le pool stock).
 *
 * D8 : le pool est restreint aux OF FERMES DÉMARRÉS (même critère que
 * `startedOfs`). Un OF planifié/suggéré, ou ferme non lancé, n'a pas de pointage
 * lu — et si `EXTQTY_0 = 0`, `resteAProduire` rend 0, ce qui créditerait sa
 * quantité entière comme « déjà produite ». Le plan appro appliquait déjà ce
 * garde au point d'appel ; il vit désormais ici pour que /charge en hérite.
 *
 * D2 : `deltaMos` porte les OF démarrés avant l'horizon (matching delta #99),
 * déjà filtrés « fermes » par l'appelant — ils comptent sans filtre de date,
 * leur STRDAT étant par construction antérieur à la fenêtre.
 *
 * Exporté pour le plan appro (`material_plan_loader`), qui applique le même cran.
 */
export function buildEncoursByArticle(inputs: {
  mos: ManufacturingOrder[]
  avancementByOf: ChargeInputs['avancementByOf']
  deltaMos?: EncoursOf[]
}): Map<string, number> {
  const out = new Map<string, number>()
  const today = atMidnight(new Date())
  const add = (mo: EncoursOf): void => {
    const encours = mo.quantity - ofResteAProduire(mo, inputs.avancementByOf)
    if (encours > 0) out.set(mo.article, (out.get(mo.article) ?? 0) + encours)
  }
  for (const mo of inputs.mos) {
    if (mo.status !== 1) continue
    if (!mo.startDate || atMidnight(mo.startDate) > today) continue
    add(mo)
  }
  for (const mo of inputs.deltaMos ?? []) add(mo)
  return out
}

/**
 * Versions d'entrées figées conservées simultanément. Une page ouverte peut
 * servir d'un payload périmé (SWR) tant qu'une ou deux générations de reload
 * sont passées : au-delà, le détail retombe sur la relecture live (comportement
 * historique) — rare, et le hard refresh reste la sortie de secours.
 */
const PINNED_INPUTS_KEPT = 5
const PINNED_INPUTS_TTL = 12 * 60 * 60 * 1000

/** Snapshot d'une exécution du factory payload, réclamable par le détail. */
interface PinnedChargeSnapshot {
  inputs: ChargeInputs
  /** Stock strict+CQ des articles de charge (`computeChargeStock`). */
  stock: Map<string, number>
}

/**
 * Fige les entrées X3 et le stock d'une exécution du factory payload sous une
 * version.
 *
 * Le détail d'un bucket (`loadChargeDetail`) réclame cette version : il est
 * alors calculé depuis EXACTEMENT les mêmes entrées que la barre affichée, au
 * lieu de relire les caches SWR de boardDataset qui ont pu tourner entre le
 * rendu de la page et le clic — c'est ce décalage qui faisait afficher 14 h à
 * la barre et 9,9 h à la table pour la même semaine.
 *
 * Coût mémoire faible : `mos` / `orderLines` / gammes sont déjà résidents via
 * les caches de boardDataset — on ne stocke ici que l'enveloppe et les Map
 * dérivées, qui référencent les mêmes objets.
 */
export async function pinChargeInputs(
  version: string,
  snapshot: PinnedChargeSnapshot
): Promise<void> {
  await cacheNs('charge').set({
    key: `charge:inputs:${version}`,
    value: snapshot,
    ttl: PINNED_INPUTS_TTL,
  })
  const indexEntry = await cacheNs('charge')
    .get<{ v: string[] }>({ key: 'charge:inputs:index' })
    .catch(() => null)
  const known = indexEntry?.v ?? []
  const kept = [version, ...known.filter((v) => v !== version)].slice(0, PINNED_INPUTS_KEPT)
  await cacheNs('charge').set({
    key: 'charge:inputs:index',
    value: { v: kept },
    ttl: PINNED_INPUTS_TTL,
  })
  for (const stale of known) {
    if (!kept.includes(stale)) {
      await cacheNs('charge')
        .delete({ key: `charge:inputs:${stale}` })
        .catch(() => {})
    }
  }
}

/** Snapshot figé d'une version, ou null (inconnue / expirée). */
export async function getPinnedChargeInputs(version: string): Promise<PinnedChargeSnapshot | null> {
  return cacheNs('charge')
    .get<PinnedChargeSnapshot>({ key: `charge:inputs:${version}` })
    .catch(() => null)
}

/**
 * Cœur du payload charge — sans HttpContext (consommé par l'endpoint HTTP ET le
 * tool agent `getCharge`).
 */
export type OfDateMode = 'start' | 'end'

/** Séries temporelles aux 3 crans de netting (brut, net, reste à produire). */
export interface LoadQtyBuckets {
  brut: number[]
  net: number[]
  reste: number[]
}

/** Information d'horizon de demande X3 d'un article. */
export interface DemandHorizonInfo {
  value: number
  unit: number
  label: string
  endIso: string | null
}

/** Formate l'horizon de demande X3 en libellé lisible (ex: "4 sem", "15 j", "2 mois"). */
export function formatDemandHorizon(dh?: { value: number; unit: number }): string {
  if (!dh || !Number.isFinite(dh.value) || dh.value <= 0) return ''
  const val = dh.value
  switch (dh.unit) {
    case 1:
      return `${val} j`
    case 2:
      return `${val} jo`
    case 3:
      return `${val} sem`
    case 4:
      return `${val} qz`
    case 5:
      return `${val} mois`
    default:
      return `${val} j`
  }
}

/** Contribution d'un Produit Fini parent à un sous-ensemble (niveau 1). */
export interface SubAssemblyPfContribution {
  pfArticle: string
  pfDescription: string
  linkQuantity: number
  demandHorizon?: DemandHorizonInfo
  monthlyQty: number[]
  weeklyQty: number[]
  monthlyHours: number[]
  weeklyHours: number[]
  monthlyQtyFerme: number[]
  monthlyQtyPrevision: number[]
  weeklyQtyFerme: number[]
  weeklyQtyPrevision: number[]
  monthlyHoursFerme: number[]
  monthlyHoursPrevision: number[]
  weeklyHoursFerme: number[]
  weeklyHoursPrevision: number[]
}

/** Sous-ensemble fabriqué par un poste de l'atelier CLP. */
export interface SubAssemblyItem {
  article: string
  description: string
  stock: number
  encours: number
  monthlyQty: LoadQtyBuckets
  weeklyQty: LoadQtyBuckets
  monthlyHours: LoadQtyBuckets
  weeklyHours: LoadQtyBuckets
  monthlyQtyFerme: LoadQtyBuckets
  monthlyQtyPrevision: LoadQtyBuckets
  weeklyQtyFerme: LoadQtyBuckets
  weeklyQtyPrevision: LoadQtyBuckets
  monthlyHoursFerme: LoadQtyBuckets
  monthlyHoursPrevision: LoadQtyBuckets
  weeklyHoursFerme: LoadQtyBuckets
  weeklyHoursPrevision: LoadQtyBuckets
  parents: SubAssemblyPfContribution[]
}

/** Groupe de sous-ensembles par poste de charge CLP. */
export interface SubAssemblyWorkstationGroup {
  wst: string
  wstLabel: string
  monthlyHours: LoadQtyBuckets
  weeklyHours: LoadQtyBuckets
  monthlyQty: LoadQtyBuckets
  weeklyQty: LoadQtyBuckets
  monthlyQtyFerme: LoadQtyBuckets
  monthlyQtyPrevision: LoadQtyBuckets
  weeklyQtyFerme: LoadQtyBuckets
  weeklyQtyPrevision: LoadQtyBuckets
  monthlyHoursFerme: LoadQtyBuckets
  monthlyHoursPrevision: LoadQtyBuckets
  weeklyHoursFerme: LoadQtyBuckets
  weeklyHoursPrevision: LoadQtyBuckets
  items: SubAssemblyItem[]
}

/**
 * Agrège les besoins de niveau 1 (PF => SE) fabriqués par l'atelier CLP,
 * classés par poste de charge, avec séries mensuelles et hebdomadaires.
 */
export function buildSubAssemblyClpGroups(params: {
  needs: ChargeNeed[]
  inputs: ChargeInputs
  wstByCode: Map<string, Workstation>
  pinnedStock: Map<string, number>
  encoursByArticle: Map<string, number>
  monthStart: Date
  horizonEnd: Date
  calendar: { factor(w: Workstation, iso: string): number } | null
  monthIdxByKey: Map<string, number>
  weekIdxByKey: Map<string, number>
  nbMonths: number
  nbWeeks: number
  cutWeekNumbers: (nums: number[]) => number[]
}): SubAssemblyWorkstationGroup[] {
  const {
    needs,
    inputs,
    wstByCode,
    pinnedStock,
    encoursByArticle,
    monthStart,
    horizonEnd,
    calendar,
    monthIdxByKey,
    weekIdxByKey,
    nbMonths,
    nbWeeks,
    cutWeekNumbers,
  } = params

  const zeros = (len: number) => Array.from({ length: len }, () => 0)
  const initBuckets = (len: number) => ({ brut: zeros(len), net: zeros(len), reste: zeros(len) })
  const round1Dec = (x: number) => Math.round(x * 10) / 10

  interface AccParent {
    pfArticle: string
    pfDescription: string
    linkQuantity: number
    demandHorizon?: DemandHorizonInfo
    monthlyQty: number[]
    weeklyQty: number[]
    monthlyHours: number[]
    weeklyHours: number[]
    monthlyQtyFerme: number[]
    monthlyQtyPrevision: number[]
    weeklyQtyFerme: number[]
    weeklyQtyPrevision: number[]
    monthlyHoursFerme: number[]
    monthlyHoursPrevision: number[]
    weeklyHoursFerme: number[]
    weeklyHoursPrevision: number[]
  }

  interface AccItem {
    article: string
    description: string
    stock: number
    encours: number
    monthlyQty: { brut: number[]; net: number[]; reste: number[] }
    weeklyQty: { brut: number[]; net: number[]; reste: number[] }
    monthlyHours: { brut: number[]; net: number[]; reste: number[] }
    weeklyHours: { brut: number[]; net: number[]; reste: number[] }
    monthlyQtyFerme: { brut: number[]; net: number[]; reste: number[] }
    monthlyQtyPrevision: { brut: number[]; net: number[]; reste: number[] }
    weeklyQtyFerme: { brut: number[]; net: number[]; reste: number[] }
    weeklyQtyPrevision: { brut: number[]; net: number[]; reste: number[] }
    monthlyHoursFerme: { brut: number[]; net: number[]; reste: number[] }
    monthlyHoursPrevision: { brut: number[]; net: number[]; reste: number[] }
    weeklyHoursFerme: { brut: number[]; net: number[]; reste: number[] }
    weeklyHoursPrevision: { brut: number[]; net: number[]; reste: number[] }
    parents: Map<string, AccParent>
  }

  const byWst = new Map<string, Map<string, AccItem>>()

  for (const n of needs) {
    if (n.depth !== 1) continue
    const wst = wstByCode.get(n.wst)
    if (wst?.stockLocation !== 'CLP') continue
    if (n.date < monthStart || n.date > horizonEnd) continue

    const day = chargeDay(n.wst, n.date, calendar, wstByCode, monthStart, horizonEnd)
    const mi = monthIdxByKey.get(monthKey(day))
    if (mi === undefined) continue
    const wi = weekIdxByKey.get(isoDay(mondayOf(day)))

    let items = byWst.get(n.wst)
    if (!items) {
      items = new Map()
      byWst.set(n.wst, items)
    }

    let item = items.get(n.article)
    if (!item) {
      item = {
        article: n.article,
        description: inputs.descriptions?.get(n.article) ?? '',
        stock: pinnedStock.get(n.article) ?? 0,
        encours: encoursByArticle.get(n.article) ?? 0,
        monthlyQty: initBuckets(nbMonths),
        weeklyQty: initBuckets(nbWeeks),
        monthlyHours: initBuckets(nbMonths),
        weeklyHours: initBuckets(nbWeeks),
        monthlyQtyFerme: initBuckets(nbMonths),
        monthlyQtyPrevision: initBuckets(nbMonths),
        weeklyQtyFerme: initBuckets(nbWeeks),
        weeklyQtyPrevision: initBuckets(nbWeeks),
        monthlyHoursFerme: initBuckets(nbMonths),
        monthlyHoursPrevision: initBuckets(nbMonths),
        weeklyHoursFerme: initBuckets(nbWeeks),
        weeklyHoursPrevision: initBuckets(nbWeeks),
        parents: new Map(),
      }
      items.set(n.article, item)
    }

    const brutH = chargeHoursWithEfficiency(n.brutHours, wst)
    const netH = chargeHoursWithEfficiency(n.netHours, wst)
    const resteH = chargeHoursWithEfficiency(n.resteHours, wst)
    const isFerme = n.nature === 'ferme'

    item.monthlyQty.brut[mi] += n.brutQty
    item.monthlyQty.net[mi] += n.netQty
    item.monthlyQty.reste[mi] += n.resteQty
    item.monthlyHours.brut[mi] += brutH
    item.monthlyHours.net[mi] += netH
    item.monthlyHours.reste[mi] += resteH

    if (isFerme) {
      item.monthlyQtyFerme.brut[mi] += n.brutQty
      item.monthlyQtyFerme.net[mi] += n.netQty
      item.monthlyQtyFerme.reste[mi] += n.resteQty
      item.monthlyHoursFerme.brut[mi] += brutH
      item.monthlyHoursFerme.net[mi] += netH
      item.monthlyHoursFerme.reste[mi] += resteH
    } else {
      item.monthlyQtyPrevision.brut[mi] += n.brutQty
      item.monthlyQtyPrevision.net[mi] += n.netQty
      item.monthlyQtyPrevision.reste[mi] += n.resteQty
      item.monthlyHoursPrevision.brut[mi] += brutH
      item.monthlyHoursPrevision.net[mi] += netH
      item.monthlyHoursPrevision.reste[mi] += resteH
    }

    if (wi !== undefined) {
      item.weeklyQty.brut[wi] += n.brutQty
      item.weeklyQty.net[wi] += n.netQty
      item.weeklyQty.reste[wi] += n.resteQty
      item.weeklyHours.brut[wi] += brutH
      item.weeklyHours.net[wi] += netH
      item.weeklyHours.reste[wi] += resteH

      if (isFerme) {
        item.weeklyQtyFerme.brut[wi] += n.brutQty
        item.weeklyQtyFerme.net[wi] += n.netQty
        item.weeklyQtyFerme.reste[wi] += n.resteQty
        item.weeklyHoursFerme.brut[wi] += brutH
        item.weeklyHoursFerme.net[wi] += netH
        item.weeklyHoursFerme.reste[wi] += resteH
      } else {
        item.weeklyQtyPrevision.brut[wi] += n.brutQty
        item.weeklyQtyPrevision.net[wi] += n.netQty
        item.weeklyQtyPrevision.reste[wi] += n.resteQty
        item.weeklyHoursPrevision.brut[wi] += brutH
        item.weeklyHoursPrevision.net[wi] += netH
        item.weeklyHoursPrevision.reste[wi] += resteH
      }
    }

    const pfArticle = n.source?.pfArticle || n.path[0] || 'Inconnu'
    let parent = item.parents.get(pfArticle)
    if (!parent) {
      const bomEntries = inputs.bomByParent.get(pfArticle)
      const bomEntry = bomEntries?.find((e) => e.componentArticle === n.article)
      const dh = inputs.demandHorizonByArticle.get(pfArticle)
      let demandHorizon: DemandHorizonInfo | undefined
      if (dh && Number.isFinite(dh.value) && dh.value > 0) {
        const end = demandHorizonEnd(dh)
        demandHorizon = {
          value: dh.value,
          unit: dh.unit,
          label: formatDemandHorizon(dh),
          endIso: end ? isoDay(end) : null,
        }
      }

      parent = {
        pfArticle,
        pfDescription: inputs.descriptions?.get(pfArticle) ?? bomEntry?.parentDescription ?? '',
        linkQuantity: bomEntry?.linkQuantity ?? 1,
        demandHorizon,
        monthlyQty: zeros(nbMonths),
        weeklyQty: zeros(nbWeeks),
        monthlyHours: zeros(nbMonths),
        weeklyHours: zeros(nbWeeks),
        monthlyQtyFerme: zeros(nbMonths),
        monthlyQtyPrevision: zeros(nbMonths),
        weeklyQtyFerme: zeros(nbWeeks),
        weeklyQtyPrevision: zeros(nbWeeks),
        monthlyHoursFerme: zeros(nbMonths),
        monthlyHoursPrevision: zeros(nbMonths),
        weeklyHoursFerme: zeros(nbWeeks),
        weeklyHoursPrevision: zeros(nbWeeks),
      }
      item.parents.set(pfArticle, parent)
    }

    parent.monthlyQty[mi] += n.brutQty
    parent.monthlyHours[mi] += brutH
    if (isFerme) {
      parent.monthlyQtyFerme[mi] += n.brutQty
      parent.monthlyHoursFerme[mi] += brutH
    } else {
      parent.monthlyQtyPrevision[mi] += n.brutQty
      parent.monthlyHoursPrevision[mi] += brutH
    }

    if (wi !== undefined) {
      parent.weeklyQty[wi] += n.brutQty
      parent.weeklyHours[wi] += brutH
      if (isFerme) {
        parent.weeklyQtyFerme[wi] += n.brutQty
        parent.weeklyHoursFerme[wi] += brutH
      } else {
        parent.weeklyQtyPrevision[wi] += n.brutQty
        parent.weeklyHoursPrevision[wi] += brutH
      }
    }
  }

  const result: SubAssemblyWorkstationGroup[] = []

  for (const [wstCode, itemsMap] of byWst.entries()) {
    const wst = wstByCode.get(wstCode)
    const wstLabel = inputs.wstLabels.get(wstCode) ?? wst?.description ?? wstCode

    const items: SubAssemblyItem[] = []

    for (const item of itemsMap.values()) {
      const parents: SubAssemblyPfContribution[] = [...item.parents.values()]
        .map((p) => ({
          pfArticle: p.pfArticle,
          pfDescription: p.pfDescription,
          linkQuantity: p.linkQuantity,
          demandHorizon: p.demandHorizon,
          monthlyQty: p.monthlyQty.map(Math.round),
          weeklyQty: cutWeekNumbers(p.weeklyQty).map(Math.round),
          monthlyHours: p.monthlyHours.map(round1Dec),
          weeklyHours: cutWeekNumbers(p.weeklyHours).map(round1Dec),
          monthlyQtyFerme: p.monthlyQtyFerme.map(Math.round),
          monthlyQtyPrevision: p.monthlyQtyPrevision.map(Math.round),
          weeklyQtyFerme: cutWeekNumbers(p.weeklyQtyFerme).map(Math.round),
          weeklyQtyPrevision: cutWeekNumbers(p.weeklyQtyPrevision).map(Math.round),
          monthlyHoursFerme: p.monthlyHoursFerme.map(round1Dec),
          monthlyHoursPrevision: p.monthlyHoursPrevision.map(round1Dec),
          weeklyHoursFerme: cutWeekNumbers(p.weeklyHoursFerme).map(round1Dec),
          weeklyHoursPrevision: cutWeekNumbers(p.weeklyHoursPrevision).map(round1Dec),
        }))
        .sort((a, b) => {
          const sumA = a.monthlyQty.reduce((s, x) => s + x, 0)
          const sumB = b.monthlyQty.reduce((s, x) => s + x, 0)
          return sumB - sumA
        })

      const formatBucket = (
        b: { brut: number[]; net: number[]; reste: number[] },
        isHours: boolean,
        isWeekly: boolean
      ) => {
        const roundFn = isHours ? round1Dec : Math.round
        const transform = isWeekly
          ? (arr: number[]) => cutWeekNumbers(arr).map(roundFn)
          : (arr: number[]) => arr.map(roundFn)
        return {
          brut: transform(b.brut),
          net: transform(b.net),
          reste: transform(b.reste),
        }
      }

      items.push({
        article: item.article,
        description: item.description,
        stock: item.stock,
        encours: item.encours,
        monthlyQty: formatBucket(item.monthlyQty, false, false),
        weeklyQty: formatBucket(item.weeklyQty, false, true),
        monthlyHours: formatBucket(item.monthlyHours, true, false),
        weeklyHours: formatBucket(item.weeklyHours, true, true),
        monthlyQtyFerme: formatBucket(item.monthlyQtyFerme, false, false),
        monthlyQtyPrevision: formatBucket(item.monthlyQtyPrevision, false, false),
        weeklyQtyFerme: formatBucket(item.weeklyQtyFerme, false, true),
        weeklyQtyPrevision: formatBucket(item.weeklyQtyPrevision, false, true),
        monthlyHoursFerme: formatBucket(item.monthlyHoursFerme, true, false),
        monthlyHoursPrevision: formatBucket(item.monthlyHoursPrevision, true, false),
        weeklyHoursFerme: formatBucket(item.weeklyHoursFerme, true, true),
        weeklyHoursPrevision: formatBucket(item.weeklyHoursPrevision, true, true),
        parents,
      })
    }

    items.sort((a, b) => a.article.localeCompare(b.article))

    const sumBuckets = (
      getBuckets: (it: SubAssemblyItem) => LoadQtyBuckets,
      len: number,
      isHours: boolean
    ): LoadQtyBuckets => {
      const brut = zeros(len)
      const net = zeros(len)
      const reste = zeros(len)
      for (const it of items) {
        const b = getBuckets(it)
        for (let i = 0; i < len; i++) {
          brut[i] += b.brut[i] ?? 0
          net[i] += b.net[i] ?? 0
          reste[i] += b.reste[i] ?? 0
        }
      }
      const roundFn = isHours ? round1Dec : Math.round
      return {
        brut: brut.map(roundFn),
        net: net.map(roundFn),
        reste: reste.map(roundFn),
      }
    }

    const cutWeeksLen = items[0]?.weeklyQty.brut.length ?? 0

    result.push({
      wst: wstCode,
      wstLabel,
      monthlyHours: sumBuckets((it) => it.monthlyHours, nbMonths, true),
      weeklyHours: sumBuckets((it) => it.weeklyHours, cutWeeksLen, true),
      monthlyQty: sumBuckets((it) => it.monthlyQty, nbMonths, false),
      weeklyQty: sumBuckets((it) => it.weeklyQty, cutWeeksLen, false),
      monthlyHoursFerme: sumBuckets((it) => it.monthlyHoursFerme, nbMonths, true),
      monthlyHoursPrevision: sumBuckets((it) => it.monthlyHoursPrevision, nbMonths, true),
      weeklyHoursFerme: sumBuckets((it) => it.weeklyHoursFerme, cutWeeksLen, true),
      weeklyHoursPrevision: sumBuckets((it) => it.weeklyHoursPrevision, cutWeeksLen, true),
      monthlyQtyFerme: sumBuckets((it) => it.monthlyQtyFerme, nbMonths, false),
      monthlyQtyPrevision: sumBuckets((it) => it.monthlyQtyPrevision, nbMonths, false),
      weeklyQtyFerme: sumBuckets((it) => it.weeklyQtyFerme, cutWeeksLen, false),
      weeklyQtyPrevision: sumBuckets((it) => it.weeklyQtyPrevision, cutWeeksLen, false),
      items,
    })
  }

  return result.sort((a, b) => a.wst.localeCompare(b.wst))
}

/** Date de rattachement d'un OF, avec repli au début si X3 ne fournit pas la fin. */
export function ofDateForMode(
  mo: Pick<ManufacturingOrder, 'startDate' | 'endDate'>,
  mode: OfDateMode = 'start'
): Date | null {
  return mode === 'end' ? (mo.endDate ?? mo.startDate) : mo.startDate
}

export async function loadChargePayloadData(params: {
  start?: string
  force?: boolean
  ofDate?: OfDateMode
}) {
  const startParam = params.start
  const force = !!params.force
  const ofDate: OfDateMode = params.ofDate === 'end' ? 'end' : 'start'

  // Horizon : N mois pleins à partir du 1er du mois de `start` (par défaut mois courant).
  const { monthStart, horizonEnd } = chargeHorizon(startParam)
  // `s12` = schéma courant du payload (s11 : barre Retard, s12 : vision sous-ensembles CLP).
  const ovSig = await new OrderLineOverrideStore().signature().catch(() => 'none')
  const cacheKey = `payload:charge:s13:${isoDay(monthStart)}:${NB_MONTHS}:${ofDate}:ov${ovSig}`
  const chargeCache = () => cacheNs('charge')
  if (force) await chargeCache().delete({ key: cacheKey })

  // Tout le calcul dans le factory : cache miss = 1 exécution, hits suivants = instant (SWR).
  return chargeCache().getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async () => {
      // Buckets mensuels.
      const monthBuckets: { key: string; label: string }[] = []
      const monthIdxByKey = new Map<string, number>()
      for (let i = 0; i < NB_MONTHS; i++) {
        const d = new Date(monthStart)
        d.setMonth(monthStart.getMonth() + i)
        monthIdxByKey.set(monthKey(d), i)
        monthBuckets.push({ key: monthKey(d), label: monthLabel(d) })
      }

      // Buckets hebdo : lundis de l'horizon.
      const weekBuckets: { key: string; label: string }[] = []
      const weekIdxByKey = new Map<string, number>()
      for (let cur = mondayOf(monthStart); cur <= horizonEnd; cur = addDays(cur, 7)) {
        const key = isoDay(cur)
        weekIdxByKey.set(key, weekBuckets.length)
        const dd = String(cur.getDate()).padStart(2, '0')
        const mm = String(cur.getMonth() + 1).padStart(2, '0')
        weekBuckets.push({ key, label: `${dd}/${mm}\nS${isoWeek(cur)}` })
      }

      const inputs = await fetchChargeInputs(monthStart, horizonEnd, force)
      // Snapshot graphe ↔ détail : chaque exécution du factory fige ses entrées
      // ET son stock sous une version que le détail d'un bucket renvoie en
      // `?v=`. Le panneau est donc calculé du même instant X3 que la barre
      // cliquée, même quand boardDataset a tourné entre-temps.
      const version = Date.now().toString(36)
      const pinnedStock = await computeChargeStock(inputs)
      await pinChargeInputs(version, { inputs, stock: pinnedStock }).catch(() => {})
      const { mos, gammeMap, workstations, wstLabels, categoryByArticle, x3Error } = inputs
      const posteNatureByWst = buildPosteNatureByWorkstation(
        [...gammeMap.values()].flat(),
        categoryByArticle
      )

      const calendar = await capacityCalendar
        .buildCalendar(monthStart.getFullYear(), horizonEnd.getFullYear())
        .catch(() => null)

      const wstByCode = new Map(workstations.map((w) => [w.code, w]))
      const capacityByWst = new Map<string, { monthly: number[]; weekly: number[] }>()
      for (const w of workstations) {
        const monthly = monthBuckets.map(() => 0)
        const weekly = weekBuckets.map(() => 0)
        for (let d = new Date(monthStart); d <= horizonEnd; d = addDays(d, 1)) {
          const factor = calendar ? calendar.factor(w, isoDay(d)) : 1
          // Sentinelle X3 (0,01 h) traitée comme fermé — cf. `isOpenDay`.
          if (!isOpenDay(w, d, factor)) continue
          const c = capDay(w, d) * factor
          const mi = monthIdxByKey.get(monthKey(d))
          if (mi !== undefined) monthly[mi] += c
          const wi = weekIdxByKey.get(isoDay(mondayOf(d)))
          if (wi !== undefined) weekly[wi] += c
        }
        capacityByWst.set(w.code, {
          monthly: monthly.map(Math.round),
          weekly: weekly.map(Math.round),
        })
      }
      const emptyCap = () => ({
        monthly: monthBuckets.map(() => 0),
        weekly: weekBuckets.map(() => 0),
      })

      type AggRecord = {
        wst: string
        date: Date
        brutHours: number
        netHours: number
        resteHours: number
        /** Quantités opérées, parallèles aux trois crans d'heures. */
        brutQty: number
        netQty: number
        resteQty: number
        field: keyof LoadPeriod
        article: string
      }
      type Acc = {
        monthly: LoadPeriod[]
        monthlyNet: LoadPeriod[]
        monthlyReste: LoadPeriod[]
        weekly: LoadPeriod[]
        weeklyNet: LoadPeriod[]
        weeklyReste: LoadPeriod[]
        /** Mêmes six séries en pièces — cf. `LoadLine.monthlyQty`. */
        monthlyQty: LoadPeriod[]
        weeklyQty: LoadPeriod[]
        monthlyNetQty: LoadPeriod[]
        weeklyNetQty: LoadPeriod[]
        monthlyResteQty: LoadPeriod[]
        weeklyResteQty: LoadPeriod[]
        articles: Set<string>
      }

      const buildLines = (records: AggRecord[]): LoadLine[] => {
        const byLine = new Map<string, Acc>()
        for (const r of records) {
          if (r.brutHours <= 0 || r.date < monthStart || r.date > horizonEnd) continue
          // 4.1 : un besoin tombant un jour fermé du poste remonte au dernier
          // jour ouvré — la capacité du bucket n'inclut pas ce jour.
          const day = chargeDay(r.wst, r.date, calendar, wstByCode, monthStart, horizonEnd)
          const mi = monthIdxByKey.get(monthKey(day))
          if (mi === undefined) continue
          const wi = weekIdxByKey.get(isoDay(mondayOf(day)))
          let acc = byLine.get(r.wst)
          if (!acc) {
            acc = {
              monthly: monthBuckets.map(emptyPeriod),
              monthlyNet: monthBuckets.map(emptyPeriod),
              monthlyReste: monthBuckets.map(emptyPeriod),
              weekly: weekBuckets.map(emptyPeriod),
              weeklyNet: weekBuckets.map(emptyPeriod),
              weeklyReste: weekBuckets.map(emptyPeriod),
              monthlyQty: monthBuckets.map(emptyPeriod),
              weeklyQty: weekBuckets.map(emptyPeriod),
              monthlyNetQty: monthBuckets.map(emptyPeriod),
              weeklyNetQty: weekBuckets.map(emptyPeriod),
              monthlyResteQty: monthBuckets.map(emptyPeriod),
              weeklyResteQty: weekBuckets.map(emptyPeriod),
              articles: new Set(),
            }
            byLine.set(r.wst, acc)
          }
          acc.monthly[mi][r.field] += r.brutHours
          acc.monthlyNet[mi][r.field] += r.netHours
          acc.monthlyReste[mi][r.field] += r.resteHours
          acc.monthlyQty[mi][r.field] += r.brutQty
          acc.monthlyNetQty[mi][r.field] += r.netQty
          acc.monthlyResteQty[mi][r.field] += r.resteQty
          if (wi !== undefined) {
            acc.weekly[wi][r.field] += r.brutHours
            acc.weeklyNet[wi][r.field] += r.netHours
            acc.weeklyReste[wi][r.field] += r.resteHours
            acc.weeklyQty[wi][r.field] += r.brutQty
            acc.weeklyNetQty[wi][r.field] += r.netQty
            acc.weeklyResteQty[wi][r.field] += r.resteQty
          }
          if (r.article) acc.articles.add(r.article)
        }
        return [...byLine.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([code, acc], i) => {
            const w = wstByCode.get(code)
            const stoloc = w?.stockLocation ?? ''
            return {
              code,
              name: wstLabels.get(code) ?? w?.description ?? code,
              color: PALETTE[i % PALETTE.length],
              articles: [...acc.articles].sort(),
              monthly: acc.monthly.map(round),
              weekly: acc.weekly.map(round),
              monthlyNet: acc.monthlyNet.map(round),
              weeklyNet: acc.weeklyNet.map(round),
              monthlyReste: acc.monthlyReste.map(round),
              weeklyReste: acc.weeklyReste.map(round),
              monthlyQty: acc.monthlyQty.map(round),
              weeklyQty: acc.weeklyQty.map(round),
              monthlyNetQty: acc.monthlyNetQty.map(round),
              weeklyNetQty: acc.weeklyNetQty.map(round),
              monthlyResteQty: acc.monthlyResteQty.map(round),
              weeklyResteQty: acc.weeklyResteQty.map(round),
              capacity: capacityByWst.get(code) ?? emptyCap(),
              atelier: stoloc,
              atelierLabel: atelierLabel(stoloc),
              workCenter: w?.workCenter ?? '',
              category: atelierCategoryFromPosteNature(posteNatureByWst.get(code) ?? 'autre'),
            }
          })
      }

      // ── Charge commande : explosion + netting en une passe (D1/D3/D4) ──
      const depthCut: DepthCutStats = { truncated: 0, cutParents: [] }
      const chargeNeeds = await computeChargeNeeds(inputs, pinnedStock, depthCut)
      const chargeNeedsWithoutDemandHorizon = await computeChargeNeeds(
        inputs,
        pinnedStock,
        undefined,
        false
      )

      const ofLines = buildLines(
        mos.flatMap((mo) => {
          const ops = gammeMap.get(mo.article) ?? []
          const moDate = ofDateForMode(mo, ofDate)
          if (!moDate) return []
          const qty = ofResteAProduire(mo, inputs.avancementByOf)
          return ops
            .filter((gamme) => gamme.workstation && gamme.rate > 0)
            .map((gamme) => {
              const hours = chargeHoursWithEfficiency(
                hoursForQuantity(gamme, qty),
                wstByCode.get(gamme.workstation)
              )
              return {
                wst: gamme.workstation,
                date: atMidnight(moDate),
                brutHours: hours,
                netHours: hours,
                // Vue OF : qty déjà déduite des pointages — les trois séries coïncident.
                resteHours: hours,
                // En pièces aussi : la quantité de l'OF est la même aux trois crans.
                brutQty: qty,
                netQty: qty,
                resteQty: qty,
                field: ofSegment(mo.status) as keyof LoadPeriod,
                article: `${mo.article} ${mo.designation ?? ''}`.trim(),
              }
            })
        })
      )

      const buildCommandLines = (needs: ChargeNeed[]) =>
        buildLines(
          // Besoin PF (depth 0) → f/s ; composants induits (depth >0) → fi/si.
          needs.map((n): AggRecord => ({
            wst: n.wst,
            date: n.date,
            brutHours: chargeHoursWithEfficiency(n.brutHours, wstByCode.get(n.wst)),
            netHours: chargeHoursWithEfficiency(n.netHours, wstByCode.get(n.wst)),
            resteHours: chargeHoursWithEfficiency(n.resteHours, wstByCode.get(n.wst)),
            brutQty: n.brutQty,
            netQty: n.netQty,
            resteQty: n.resteQty,
            field: chargeSegment(n.depth, n.nature) as keyof LoadPeriod,
            article: n.article,
          }))
        )
      const cmdLines = buildCommandLines(chargeNeeds)
      const cmdLinesWithoutDemandHorizon = buildCommandLines(chargeNeedsWithoutDemandHorizon)

      // Horizon demande X3 par poste : fin de l'horizon (FOH/FOHUOT) des
      // produits finis dont une PRÉVISION charge le poste. L'horizon est porté
      // par l'article de la ligne de demande — la racine du chemin BOM, pas le
      // composant qui charge le poste. Un poste mêle des PF à horizons
      // différents (2 et 3 semaines sur AE1) : on rend l'étendue [min, max]
      // plutôt qu'une date unique qui mentirait pour une partie des articles.
      // Calculé sur la demande SANS filtre d'horizon : c'est elle qui contient
      // les prévisions que l'horizon écarte.
      const horizonByPoste = new Map<string, { from: Date; to: Date }>()
      const horizonEndByRoot = new Map<string, Date | null>()
      for (const n of chargeNeedsWithoutDemandHorizon) {
        if (n.nature !== 'prevision') continue
        const root = n.path[0] ?? n.article
        let end = horizonEndByRoot.get(root)
        if (end === undefined) {
          end = demandHorizonEnd(inputs.demandHorizonByArticle.get(root))
          horizonEndByRoot.set(root, end)
        }
        if (!end) continue
        const cur = horizonByPoste.get(n.wst)
        if (!cur) horizonByPoste.set(n.wst, { from: end, to: end })
        else {
          if (end < cur.from) cur.from = end
          if (end > cur.to) cur.to = end
        }
      }
      const demandHorizonByPoste: Record<string, { from: string; to: string }> = {}
      for (const [wst, h] of horizonByPoste) {
        demandHorizonByPoste[wst] = { from: isoDay(h.from), to: isoDay(h.to) }
      }

      const fmtLong = (d: Date) => {
        const s = d.toLocaleDateString('fr-FR', { month: 'long' })
        return s.charAt(0).toUpperCase() + s.slice(1)
      }
      const lastMonth = new Date(monthStart)
      lastMonth.setMonth(monthStart.getMonth() + NB_MONTHS - 1)
      const rangeLabel = `${fmtLong(monthStart)} → ${fmtLong(lastMonth)} ${lastMonth.getFullYear()} · ${NB_MONTHS} mois`

      // ── Fenêtre hebdo : partir de la semaine courante ─────────────────
      // L'horizon part du lundi du 1er du mois : jusqu'à quatre semaines déjà
      // passées ouvraient le graphe. Elles sont coupées — et, si elles portent
      // encore de la charge (OF en retard, besoin non soldé), fondues en UNE
      // barre « Retard » avant la semaine courante : du travail à faire ne
      // disparaît pas. Cf. `weekWindow`. Le mensuel n'est pas touché : un mois
      // reste un mois.
      const allLines = [ofLines, cmdLines, cmdLinesWithoutDemandHorizon]
      const weekHasLoad = (i: number) =>
        allLines.some((set) =>
          set.some((l) => {
            const p = l.weekly[i]
            return !!p && p.f + p.p + p.s + p.fi + p.si > 0
          })
        )
      const weekKeysAll = weekBuckets.map((w) => w.key)
      const { pastCount, retard } = weekWindow(weekKeysAll, weekHasLoad, new Date())
      const sumPeriods = (ps: LoadPeriod[]): LoadPeriod =>
        ps.reduce(
          (a, p) => ({
            f: a.f + p.f,
            p: a.p + p.p,
            s: a.s + p.s,
            fi: a.fi + p.fi,
            si: a.si + p.si,
          }),
          emptyPeriod()
        )
      // Série hebdo recoupée : [Retard ?] + semaines à partir de la courante.
      const cutWeeks = (ps: LoadPeriod[]): LoadPeriod[] =>
        retard ? [sumPeriods(ps.slice(0, pastCount)), ...ps.slice(pastCount)] : ps.slice(pastCount)
      // La capacité est PARTAGÉE entre les lignes des trois jeux (même objet
      // `capacityByWst`) : la recouper ligne par ligne la recouperait plusieurs
      // fois. Une seule copie par objet source. Capacité du Retard : 0 — une
      // capacité écoulée ne se consomme plus, aucun plafond à y comparer.
      const trimmedCaps = new Map<LoadLine['capacity'], LoadLine['capacity']>()
      const trimLine = (l: LoadLine): LoadLine => {
        let cap = trimmedCaps.get(l.capacity)
        if (!cap) {
          const future = l.capacity.weekly.slice(pastCount)
          cap = { monthly: l.capacity.monthly, weekly: retard ? [0, ...future] : future }
          trimmedCaps.set(l.capacity, cap)
        }
        return {
          ...l,
          weekly: cutWeeks(l.weekly),
          weeklyNet: cutWeeks(l.weeklyNet),
          weeklyReste: cutWeeks(l.weeklyReste),
          weeklyQty: cutWeeks(l.weeklyQty),
          weeklyNetQty: cutWeeks(l.weeklyNetQty),
          weeklyResteQty: cutWeeks(l.weeklyResteQty),
          capacity: cap,
        }
      }
      const [ofRows, cmdRows, cmdRowsWithoutDemandHorizon] =
        pastCount === 0 ? allLines : allLines.map((set) => set.map(trimLine))

      const cutWeekNumbers = (nums: number[]): number[] => {
        if (pastCount === 0) return nums
        return retard
          ? [nums.slice(0, pastCount).reduce((a, b) => a + b, 0), ...nums.slice(pastCount)]
          : nums.slice(pastCount)
      }

      const seClpGroups = buildSubAssemblyClpGroups({
        needs: chargeNeeds,
        inputs,
        wstByCode,
        pinnedStock,
        encoursByArticle: buildEncoursByArticle(inputs),
        monthStart,
        horizonEnd,
        calendar,
        monthIdxByKey,
        weekIdxByKey,
        nbMonths: monthBuckets.length,
        nbWeeks: weekBuckets.length,
        cutWeekNumbers,
      })

      const seClpGroupsWithoutDemandHorizon = buildSubAssemblyClpGroups({
        needs: chargeNeedsWithoutDemandHorizon,
        inputs,
        wstByCode,
        pinnedStock,
        encoursByArticle: buildEncoursByArticle(inputs),
        monthStart,
        horizonEnd,
        calendar,
        monthIdxByKey,
        weekIdxByKey,
        nbMonths: monthBuckets.length,
        nbWeeks: weekBuckets.length,
        cutWeekNumbers,
      })

      const weekRows = [
        ...(retard
          ? [
              {
                key: retardBucketKey(weekKeysAll[0], weekKeysAll[pastCount]),
                label: 'Retard',
              },
            ]
          : []),
        ...weekBuckets.slice(pastCount),
      ]

      const ateliers = new Map<string, { code: string; label: string; category: AtelierCategory }>()
      for (const l of [...ofRows, ...cmdRows, ...cmdRowsWithoutDemandHorizon]) {
        if (l.atelier && !ateliers.has(l.atelier)) {
          ateliers.set(l.atelier, { code: l.atelier, label: l.atelierLabel, category: l.category })
        }
      }

      return {
        rangeLabel,
        // Ancre d'horizon résolue (1er du mois de départ) : le détail d'un
        // bucket la renvoie pour viser exactement la même fenêtre.
        startIso: isoDay(monthStart),
        ofDate,
        // Version du snapshot : le client la renvoie au détail (`?v=`) pour un
        // total de table aligné sur la hauteur de la barre, snapshot compris.
        version,
        months: monthBuckets.map((m) => m.label),
        weeks: weekRows.map((w) => w.label),
        // Clés de bucket (non affichées) : le client les renvoie telles quelles
        // pour demander le détail d'une période — pas d'index positionnel, qui
        // se décalerait dès que l'horizon glisse.
        monthKeys: monthBuckets.map((m) => m.key),
        weekKeys: weekRows.map((w) => w.key),
        ofLines: ofRows,
        cmdLines: cmdRows,
        cmdLinesWithoutDemandHorizon: cmdRowsWithoutDemandHorizon,
        seClpGroups,
        seClpGroupsWithoutDemandHorizon,
        demandHorizonByPoste,
        ateliers: [...ateliers.values()].sort((a, b) => a.label.localeCompare(b.label)),
        // D9 : ce que le plafond depth-4 a coupé, pour que la disparition soit
        // lisible à l'écran au lieu d'être silencieuse.
        depthCut: {
          truncated: depthCut.truncated,
          parents: [...new Set(depthCut.cutParents)].sort(),
        },
        x3Error,
      }
    }),
  })
}

/** GET /charge — payload de la page Inertia de projection de charge long terme. */
export async function loadChargePayload(ctx: HttpContext) {
  return loadChargePayloadData({
    start: ctx.request.input('start') as string | undefined,
    ofDate: ctx.request.input('ofDate') === 'end' ? 'end' : 'start',
    force: !!ctx.request.input('refresh'),
  })
}
