/**
 * Moteur domaine « suivi des commandes » — port TS de apps/suivi-commandes (master).
 *
 * Architecture hexagonale aplatie dans un seul fichier (cf. issue #19, décision de
 * démarrage : fichier unique plutôt qu'éclatement app/domain/suivi/*).
 *
 * Contient :
 *  - Modèles purs  : OrderLine (+ Emplacement), Status, CauseType, RetardCause, PaletteInfo
 *  - Ports         : StockProvider, BomNavigator, OfMatcherPort, ChargeCalculatorPort, PaletteInfoProvider
 *  - Services purs : assignStatuses (statut + signal CQ + zone), analyzeRetardCause,
 *                    computePaletteSummary, computeRetardCharge, recommendActions
 *
 * Aucune dépendance ERP / repo ici — la composition (app/services/suivi_service.ts)
 * branche les ports sur les repos X3 existants.
 *
 * --- Note sur l'axe statut (issue #19) ---
 * Ce module porte l'axe « allocation / expédition » (4 statuts métier ci-dessous), qui
 * répond à : « cette ligne de commande est-elle prête / allouable / en retard à l'expé ? ».
 * Il NE remplace PAS `order-impacts.ts` (axe « faisabilité OF » : on_time/stock/retard/
 * bloquee/sans_couverture) qui répond à une autre question (les OF sont-ils réalisables ?)
 * et alimente le board. Les deux axes coexistent volontairement.
 */

// ---------------------------------------------------------------------------
// Modèles
// ---------------------------------------------------------------------------

export type SuiviStatus =
  | 'A_EXPEDIER'
  | 'ALLOCATION_A_FAIRE'
  | 'RETARD_PROD'
  | 'RAS'
export type TypeCommande = 'MTS' | 'MTO' | 'NOR'

/** Cause structurée d'un retard de production (remplace l'ancien parsing textuel). */
export type CauseType =
  | 'STOCK_DISPONIBLE_NON_ALLOUE'
  | 'ATTENTE_RECEPTION_FOURNISSEUR'
  | 'AUCUN_OF_PLANIFIE'
  | 'RUPTURE_COMPOSANTS'
  /** OF faisable mais planifié après la date d'expédition (retard pur d'ordonnancement). */
  | 'RETARD_ORDONNANCEMENT'
  /** Analyse rétro : OF affermi tard car un composant n'est devenu disponible que tardivement. */
  | 'RETARD_COMPOSANT_TARDIF'
  | 'INCONNUE'

/** Réception d'achat couvrant un composant manquant (ETA + n° d'achat), issue du moteur. */
export interface CauseReception {
  /** Date d'arrivée prévue ISO (YYYY-MM-DD). */
  eta: string
  /** N° de commande d'achat (PORDERQ.POHNUM). */
  po: string
  supplier: string
}

export interface RetardCause {
  typeCause: CauseType
  /** {article_composant: qté_manquante} — non vide seulement pour RUPTURE_COMPOSANTS. */
  composants: Record<string, number>
  message: string
  /** ETA de la réception couvrant le composant goulot (RUPTURE_COMPOSANTS) — null sinon. */
  reception?: CauseReception | null
  /** Jours de retard d'ordonnancement (RETARD_ORDONNANCEMENT) — OF planifié après expé. */
  joursRetard?: number
  /** Analyse rétrospective (RETARD_COMPOSANT_TARDIF / RETARD_ORDONNANCEMENT rétro) — null sinon. */
  retro?: RetroCause | null
}

/** Composant le plus tardif d'un OF (analyse rétrospective). */
export interface RetroComposantTardif {
  art: string
  /** Date de disponibilité réelle (passage statut A) ISO YYYY-MM-DD. */
  dispoA: string
  /** Vrai si la pièce a séjourné en contrôle qualité (dispoA postérieure à la réception brute). */
  viaControleQualite: boolean
}

/** Cause rétrospective : affermissement OF réel + composant disponible tardivement. */
export interface RetroCause {
  ofPegue: string
  /** Date d'affermissement de l'OF (MFGHEAD.CREDAT) ISO YYYY-MM-DD. */
  dateAffermissement: string | null
  /** Date d'expédition commande ISO YYYY-MM-DD. */
  dateExpedition: string | null
  /** Composant retenu comme goulot (disponible tard) — null si aucun composant tardif. */
  composantTardif: RetroComposantTardif | null
}

/** Entrée alimentant `analyzeRetroCause` (construite côté service depuis MFGMAT + MFGHEAD + STOJOU). */
export interface RetroCauseInput {
  ofPegue: string
  dateAffermissement: Date | null
  dateExpedition: Date | null
  /** Composants réels de l'OF avec leur disponibilité (statut A) et réception brute. */
  composants: { art: string; dispoA: Date | null; rawReception: Date | null }[]
}

const ISO_DAY = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null)

/**
 * Analyse rétrospective de la cause d'un retard de production pour une ligne rattachée à un OF
 * ferme. Identifie le composant dont la disponibilité réelle (statut A) est la plus tardive, et
 * ne l'impute QUE s'il est arrivé tard : disponible à moins de `margeJours` avant l'expédition,
 * ou après l'affermissement de l'OF. Sinon → `RETARD_ORDONNANCEMENT` (OF affermi tard sans
 * composant tardif identifiable). Renvoie null si l'entrée est inexploitable (pas d'OF).
 */
export function analyzeRetroCause(input: RetroCauseInput, margeJours = 2): RetardCause | null {
  if (!input.ofPegue) return null

  // Composant disponible le plus tard (max dispoA). Les composants sans date connue sont ignorés.
  let latest: { art: string; dispoA: Date; rawReception: Date | null } | null = null
  for (const c of input.composants) {
    if (!c.dispoA) continue
    if (!latest || c.dispoA > latest.dispoA) latest = { art: c.art, dispoA: c.dispoA, rawReception: c.rawReception }
  }

  const retroBase: RetroCause = {
    ofPegue: input.ofPegue,
    dateAffermissement: ISO_DAY(input.dateAffermissement),
    dateExpedition: ISO_DAY(input.dateExpedition),
    composantTardif: null,
  }

  if (latest) {
    // Seuil « arrivé tard » : dispo >= (expé − marge) OU dispo >= affermissement.
    const expe = input.dateExpedition
    const seuilExpe = expe ? new Date(expe.getTime() - margeJours * 86_400_000) : null
    const tardVsExpe = seuilExpe ? latest.dispoA >= seuilExpe : false
    const tardVsAffermissement = input.dateAffermissement ? latest.dispoA >= input.dateAffermissement : false

    if (tardVsExpe || tardVsAffermissement) {
      const viaCq = !!(latest.rawReception && latest.dispoA > latest.rawReception)
      return {
        typeCause: 'RETARD_COMPOSANT_TARDIF',
        composants: {},
        message: '',
        retro: {
          ...retroBase,
          composantTardif: { art: latest.art, dispoA: ISO_DAY(latest.dispoA)!, viaControleQualite: viaCq },
        },
      }
    }
  }

  // OF affermi mais aucun composant tardif identifié → retard d'ordonnancement (affermissement↔expé).
  let joursRetard = 0
  if (input.dateAffermissement && input.dateExpedition && input.dateAffermissement > input.dateExpedition) {
    joursRetard = Math.round((input.dateAffermissement.getTime() - input.dateExpedition.getTime()) / 86_400_000)
  }
  return {
    typeCause: 'RETARD_ORDONNANCEMENT',
    composants: {},
    message: 'OF affermi en retard',
    joursRetard,
    retro: retroBase,
  }
}

/** Statut de service d'une commande tel que produit par le moteur de faisabilité. */
export type EngineStatut = 'on_time' | 'stock' | 'retard' | 'bloquee' | 'sans_couverture'

/**
 * Verdict du moteur d'ordonnancement (loadOrderImpacts) agrégé par commande — source unique
 * de vérité de la cause de retard suivi. Construit côté service à partir du même pipeline que
 * la page ruptures, puis traduit en RetardCause par `mapEngineCause`.
 */
export interface OrderCauseInfo {
  statut: EngineStatut
  joursRetard: number
  /** Composants en rupture ({art, qty}) — non vide seulement si statut = 'bloquee'. */
  components: { art: string; qty: number }[]
  /** Réception couvrant le composant goulot (la plus tardive) — null si aucune. */
  reception: CauseReception | null
}

/**
 * Traduit le verdict moteur d'une commande en cause de retard (source unique de vérité).
 * `lineIsFabrique` discrimine, en l'absence de supply (`sans_couverture`), entre « aucun OF
 * planifié » (article fabriqué) et « attente réception fournisseur » (article acheté).
 */
export function mapEngineCause(info: OrderCauseInfo, lineIsFabrique: boolean): RetardCause | null {
  switch (info.statut) {
    case 'bloquee':
      return {
        typeCause: 'RUPTURE_COMPOSANTS',
        composants: Object.fromEntries(info.components.map((c) => [c.art, c.qty])),
        message: '',
        reception: info.reception,
      }
    case 'sans_couverture':
      return lineIsFabrique
        ? { typeCause: 'AUCUN_OF_PLANIFIE', composants: {}, message: 'Aucun OF planifié' }
        : {
            typeCause: 'ATTENTE_RECEPTION_FOURNISSEUR',
            composants: {},
            message: 'Attente réception fournisseur',
          }
    case 'retard':
      return {
        typeCause: 'RETARD_ORDONNANCEMENT',
        composants: {},
        message: 'OF planifié en retard',
        joursRetard: info.joursRetard,
      }
    case 'stock':
    case 'on_time':
      // Faisable selon le moteur : le retard ne vient pas de la production → stock à allouer/expédier.
      return {
        typeCause: 'STOCK_DISPONIBLE_NON_ALLOUE',
        composants: {},
        message: 'Stock disponible — non alloué',
      }
  }
}

/**
 * Un emplacement physique de stock rattaché à une ligne de commande.
 *
 * `source` discrimine les 2 cas métier Sage X3 (cf. emplacement_repository) :
 *  - `STOALL` : allocation DÉTAILLÉE — l'article est déjà « loué » à la commande
 *    (MTS / contre-marque). LOC = le bin réservé.
 *  - `STOCK`  : stock PHYSIQUE — l'article est dans ce bin, pas encore alloué
 *    (MTO / commande normale). Il faut faire l'allocation (ALLOCATION_A_FAIRE).
 *
 * `stoCou` = chrono stock X3 (STOCOU_0). Lien canonique entre STOALL et STOCK :
 *    STOALL.STOCOU_0 = STOCK.STOCOU_0 → donne LOC + PALNUM + qty réelle.
 * `isQc` = vrai si le stock physique est sous contrôle qualité (STA='Q').
 * `alreadyAllocated` = vrai si ce stock est déjà alloué à une autre commande
 *   (utile pour l'affichage des lignes sans allocation : montrer barré).
 */
export interface Emplacement {
  nom: string
  hum?: string | null
  dateMiseEnStock?: Date | null
  qtePalette?: number | null
  source: 'STOALL' | 'STOCK'
  stoCou?: string | null
  isQc?: boolean
  alreadyAllocated?: boolean
}

export interface OrderLine {
  numCommande: string
  /** N° de ligne sur la commande (VCRLIN_0) — pour le matching allocations STOALL. */
  ligne: string
  article: string
  designation: string
  nomClient: string
  typeCommande: TypeCommande
  dateExpedition: Date | null
  dateLivPrevu: Date | null
  qteCommandee: number
  qteAllouee: number
  qteRestante: number
  isFabrique: boolean
  isHardPegged: boolean
  /**
   * N° de l'OF rattaché par contremarque (SORDERQ.FMINUM_0). Permet l'analyse rétrospective
   * (affermissement + composant tardif). Null si la commande n'est pas peguée sur un OF.
   */
  ofPegue?: string | null
  /** Emplacements de stock (zone d'expédition). Vide si la donnée ERP n'est pas chargée. */
  emplacements?: Emplacement[]
  /** True si les allocations X3 (MTS) portent sur du stock sous CQ. */
  allocationQc?: boolean
}

export interface StatusAssignment {
  line: OrderLine
  status: SuiviStatus
  besoinNet: number
  qteAlloueeVirtuelle: number
  qteAlloueeVirtuelleStricte: number
  qteAlloueeVirtuelleCq: number
  utiliseStockSousCq: boolean
  /** Signal CQ de statut : du stock sous contrôle qualité a été consommé pour cette ligne. */
  alerteCqStatut: boolean
  /** Cause du retard — renseignée par analyzeRetardCause() après coup (null sinon). */
  cause: RetardCause | null
}

export interface StockBreakdown {
  strict: number
  qc: number
  total: number
}

export interface PaletteInfo {
  unitesParPal: number
  /** "800x1200" (Standard) ou "1000x1200" (EasyHome). */
  typePalette: '800x1200' | '1000x1200'
  /** "Standard" ou "EasyHome". */
  gamme: string
}

// ---------------------------------------------------------------------------
// Ports (interfaces — branchés par la composition sur les repos X3)
// ---------------------------------------------------------------------------

export interface StockProvider {
  /** Stock utilisable pour la planification (physique + sous CQ - alloué). */
  getAvailableStock(article: string): number
  /** Décomposition strict / CQ du stock allocable. */
  getStockBreakdown(article: string): StockBreakdown
}

export interface OFInfo {
  numOf: string
  article: string
  qteRestante: number
  statutNum: number
  dateDebut?: Date | null
  dateFin?: Date | null
}

export interface OfMatcherPort {
  findMatchingOf(numCommande: string, article: string, typeCommande: TypeCommande): OFInfo | null
  /** Quantités déjà allouées dans l'ERP pour un OF donné : {article: qté}. */
  getAllocations(numOf: string): Record<string, number>
}

export interface BomNavigator {
  /** Descend la BOM et retourne les composants en rupture : {composant: qté_manquante}. */
  getComponentShortages(
    article: string,
    quantity: number,
    ownAllocations: Record<string, number>,
  ): Record<string, number>
  /** True si le composant est dans un sous-ensemble fabriqué (niveau > 1). */
  isComponentInSubassembly(component: string, rootArticle: string): boolean
  /** True si le composant apparaît quelque part dans l'arbre BOM de l'article. */
  isInBom(component: string, article: string): boolean
}

export interface ChargeCalculatorPort {
  /** Charge de l'article final uniquement (gamme directe) : {poste: heures}. */
  calculateDirectCharge(article: string, quantity: number): Record<string, number>
  /** Charge complète incluant sous-ensembles fabriqués (récursif) : {poste: heures}. */
  calculateRecursiveCharge(article: string, quantity: number): Record<string, number>
  getPosteLibelle(poste: string): string
  isValidPoste(poste: string): boolean
}

export interface PaletteInfoProvider {
  /** Infos de conditionnement palette, ou null si l'article n'est pas en palette. */
  getPaletteInfo(article: string): PaletteInfo | null
}

// ---------------------------------------------------------------------------
// Helpers ligne (zone d'expédition, retard, besoin net)
// ---------------------------------------------------------------------------

/** Emplacements considérés « zone d'expédition » : quai, stock magasin, expédition.
 *  Attention : "SM" sans précaution matche "SMLQxx" qui n'est PAS une zone d'expé.
 *  Le lookahead négatif `(?!LQ)` exclut SMLQ (Stock Magasin Logistique).
 */
export const ZONE_EXPEDITION_PATTERN = /QUAI|^(?:SM(?!LQ))|EXP|S9C|S3C/i

export function besoinNet(line: OrderLine): number {
  return Math.max(0, line.qteRestante - line.qteAllouee)
}

/**
 * True si au moins un emplacement de la ligne est en zone d'expédition.
 * Si la donnée emplacement n'est pas chargée (champ ERP manquant — cf. ENRICHMENT_TODO),
 * retourne false → is_retard se comporte comme avant l'enrichissement.
 */
export function enZoneExpedition(line: OrderLine, pattern: RegExp = ZONE_EXPEDITION_PATTERN): boolean {
  return (line.emplacements ?? [])
    .filter((e) => !e.alreadyAllocated)
    .some((e) => pattern.test(e.nom))
}

/**
 * Retard de production : date d'expédition passée ET pas en zone d'expédition
 * (rien n'a été préparé, ou c'est bloqué en amont).
 */
export function isRetardProd(line: OrderLine, refDate: Date): boolean {
  if (!line.dateExpedition) return false
  return line.dateExpedition < refDate && !enZoneExpedition(line)
}

/**
 * Retard d'expédition — sous-classification d'un retard.
 *
 * Indépendamment du type de commande (MTS / MTO / NOR) : si la date d'expédition
 * est passée et que TOUTE la quantité restante est allouée (source STOALL) en
 * zone d'expédition, la marchandise est au quai et n'est pas partie → retard
 * d'expédition (sous-type de RETARD_PROD).
 *
 * Une ligne en zone avec du stock libre (STOCK, pas STOALL) ou avec allocation
 * partielle n'est PAS un retard d'expédition : c'est un problème d'allocation
 * ou de production, et la ligne tombera sur RETARD_PROD via la branche date
 * passée d'assignStatuses().
 */
export function isRetardExpe(line: OrderLine, refDate: Date): boolean {
  if (!line.dateExpedition) return false
  if (line.dateExpedition >= refDate) return false
  const qteInZone = (line.emplacements ?? [])
    .filter((e) => e.source === 'STOALL' && ZONE_EXPEDITION_PATTERN.test(e.nom))
    .reduce((sum, e) => sum + (e.qtePalette ?? 0), 0)
  return qteInZone >= line.qteRestante
}

/** Alias historique de isRetardProd — conservé pour rétrocompatibilité (tests, code tiers). */
export function isRetard(line: OrderLine, refDate: Date): boolean {
  return isRetardProd(line, refDate)
}

// ---------------------------------------------------------------------------
// status_assigner
// ---------------------------------------------------------------------------

/**
 * Assigne un statut métier à chaque ligne de commande.
 *
 * Règles, par ordre de priorité :
 *  1. date d'expédition passée                  → RETARD_PROD
 *                                                Indépendamment du type (MTS/MTO/NOR).
 *  2. besoin_net <= 0                            → A_EXPEDIER
 *  3. MTS fabriqué (pas d'allocation virtuelle)  → RAS
 *  4. MTS achat / MTO / NOR :
 *      couvert par stock virtuel                → ALLOCATION_A_FAIRE
 *      sinon                                    → RAS
 *  5. Harmonisation : RAS + signal CQ consommé   → ALLOCATION_A_FAIRE
 *    (sauf MTS fabriqué — l'allocation n'y est pas le bon levier métier)
 *
 * Le champ `cause` reste null : il est renseigné après coup par analyzeRetardCause().
 */
export function assignStatuses(
  lines: OrderLine[],
  stock: Map<string, StockBreakdown>,
  referenceDate: Date,
): StatusAssignment[] {
  // Tri prioritaire pour l'allocation séquentielle : date expé, date liv prévue, num commande.
  const sorted = [...lines].sort((a, b) => {
    const da = a.dateExpedition?.getTime() ?? Infinity
    const db = b.dateExpedition?.getTime() ?? Infinity
    if (da !== db) return da - db
    const la = a.dateLivPrevu?.getTime() ?? Infinity
    const lb = b.dateLivPrevu?.getTime() ?? Infinity
    if (la !== lb) return la - lb
    return a.numCommande.localeCompare(b.numCommande)
  })

  // Stock virtuel par article (strict / CQ), borné à >= 0 et cohérent avec le total.
  const virtualStrict = new Map<string, number>()
  const virtualQc = new Map<string, number>()
  for (const line of sorted) {
    if (virtualStrict.has(line.article)) continue
    const bd = stock.get(line.article) ?? { strict: 0, qc: 0, total: 0 }
    const total = Math.max(0, bd.total)
    let strict = Math.max(0, bd.strict)
    let qc = Math.max(0, bd.qc)
    strict = Math.min(strict, total)
    qc = Math.min(qc, total - strict)
    virtualStrict.set(line.article, strict)
    virtualQc.set(line.article, qc)
  }

  // Projection dédiée au signal front CQ (contrôle de statut), indépendante de
  // l'allocation réelle pour ne pas impacter les statuts existants.
  const signalStrict = new Map(virtualStrict)
  const signalQc = new Map(virtualQc)

  const consumeForCqSignal = (article: string, quantity: number): number => {
    const qty = Math.max(0, quantity)
    const strictAvail = signalStrict.get(article) ?? 0
    const strictUsed = Math.min(qty, strictAvail)
    signalStrict.set(article, strictAvail - strictUsed)
    const manque = qty - strictUsed
    const qcAvail = signalQc.get(article) ?? 0
    const cqUsed = Math.min(manque, qcAvail)
    signalQc.set(article, qcAvail - cqUsed)
    return cqUsed
  }

  // Garde l'ordre original pour restituer le résultat dans l'ordre d'entrée.
  const orderIndex = new Map(lines.map((l, i) => [l, i] as const))
  const assignments: StatusAssignment[] = []

  for (const line of sorted) {
    const besoin = besoinNet(line)

    // Signal CQ.
    //  - MTS : l'allocation est réelle X3, le CQ vient des attributs du stock
    //    alloué (via STOCOU→STOCK.STA='Q'). Porté par line.allocationQc.
    //  - MTO/NOR : allocation virtuelle, on pioche dans le pool stock (strict/QC).
    let alerteCqStatut = line.allocationQc ?? false
    if (!alerteCqStatut && line.typeCommande !== 'MTS') {
      const qteSignal = besoin > 0 ? besoin : Math.min(Math.max(0, line.qteRestante), Math.max(0, line.qteAllouee))
      alerteCqStatut = consumeForCqSignal(line.article, qteSignal) > 0
    }

    // RÈGLE 1 — Date d'expédition passée.
    //  - besoin <= 0 (alloué)          → A_EXPEDIER
    //  - besoin > 0 + en zone d'expé   → ALLOCATION_A_FAIRE (stock présent, allocation ERP manquante)
    //  - besoin > 0 + hors zone        → RETARD_PROD
    if (line.dateExpedition && line.dateExpedition < referenceDate) {
      if (besoin <= 0) {
        assignments.push(emptyAssignment(line, 'A_EXPEDIER', besoin, alerteCqStatut))
      } else if (enZoneExpedition(line)) {
        assignments.push(emptyAssignment(line, 'ALLOCATION_A_FAIRE', besoin, alerteCqStatut))
      } else {
        assignments.push(emptyAssignment(line, 'RETARD_PROD', besoin, alerteCqStatut))
      }
      continue
    }

    if (besoin <= 0) {
      assignments.push(emptyAssignment(line, 'A_EXPEDIER', besoin, alerteCqStatut))
      continue
    }

    // MTS fabriqué : pas d'allocation virtuelle. Si allocation X3 > 0 → prêt à
    // expédier (même partiel, expéditions partielles autorisées + auto-allocation X3).
    // Sinon → RAS (rien de prêt).
    if (line.typeCommande === 'MTS' && line.isFabrique) {
      const status: SuiviStatus = (line.qteAllouee > 0) ? 'A_EXPEDIER' : 'RAS'
      assignments.push(emptyAssignment(line, status, besoin, alerteCqStatut))
      continue
    }

    // MTS achat / MTO / NOR : allocation virtuelle strict puis CQ.
    const strict = virtualStrict.get(line.article) ?? 0
    const qc = virtualQc.get(line.article) ?? 0

    const allocStrict = Math.min(besoin, strict)
    virtualStrict.set(line.article, strict - allocStrict)

    const manqueApresStrict = besoin - allocStrict
    const allocQc = Math.min(manqueApresStrict, qc)
    virtualQc.set(line.article, qc - allocQc)

    const allocTotal = allocStrict + allocQc
    const couvert = allocTotal >= besoin

    let status: SuiviStatus
    if (couvert) {
      status = 'ALLOCATION_A_FAIRE'
    } else if (isRetardProd(line, referenceDate)) {
      status = 'RETARD_PROD'
    } else {
      status = 'RAS'
    }

    // Harmonisation front : RAS + signal CQ consommé → ALLOCATION_A_FAIRE.
    if (status === 'RAS' && alerteCqStatut) {
      status = 'ALLOCATION_A_FAIRE'
    }

    assignments.push({
      line,
      status,
      besoinNet: besoin,
      qteAlloueeVirtuelle: allocTotal,
      qteAlloueeVirtuelleStricte: allocStrict,
      qteAlloueeVirtuelleCq: allocQc,
      utiliseStockSousCq: allocQc > 0,
      alerteCqStatut,
      cause: null,
    })
  }

  // Restitue l'ordre original.
  assignments.sort(
    (a, b) => (orderIndex.get(a.line) ?? 0) - (orderIndex.get(b.line) ?? 0),
  )

  return assignments
}

function emptyAssignment(
  line: OrderLine,
  status: SuiviStatus,
  besoin: number,
  alerteCqStatut: boolean,
): StatusAssignment {
  return {
    line,
    status,
    besoinNet: besoin,
    qteAlloueeVirtuelle: 0,
    qteAlloueeVirtuelleStricte: 0,
    qteAlloueeVirtuelleCq: 0,
    utiliseStockSousCq: false,
    alerteCqStatut,
    cause: null,
  }
}

// ---------------------------------------------------------------------------
// cause_analyzer
// ---------------------------------------------------------------------------

/**
 * Analyse la cause d'un retard. L'appelant doit s'assurer que la ligne est en RETARD_PROD.
 * Retourne null si fabriqué + OF présent + aucune rupture (cause indéterminée côté BOM).
 */
export function analyzeRetardCause(
  line: OrderLine,
  stockProvider: StockProvider,
  ofMatcher: OfMatcherPort,
  bomNavigator: BomNavigator,
): RetardCause | null {
  // Article acheté : stock dispo ou attente réception.
  if (!line.isFabrique) {
    const dispo = stockProvider.getAvailableStock(line.article)
    if (dispo > 0) {
      return {
        typeCause: 'STOCK_DISPONIBLE_NON_ALLOUE',
        composants: {},
        message: 'Stock disponible — non alloué',
      }
    }
    return {
      typeCause: 'ATTENTE_RECEPTION_FOURNISSEUR',
      composants: {},
      message: 'Attente réception fournisseur',
    }
  }

  // Article fabriqué : chercher l'OF.
  const of = ofMatcher.findMatchingOf(line.numCommande, line.article, line.typeCommande)
  if (of === null) {
    return { typeCause: 'AUCUN_OF_PLANIFIE', composants: {}, message: 'Aucun OF planifié' }
  }

  const ownAllocs = ofMatcher.getAllocations(of.numOf)
  const rawShortages = bomNavigator.getComponentShortages(line.article, line.qteRestante, ownAllocs)
  const shortages: Record<string, number> = {}
  for (const [art, qty] of Object.entries(rawShortages)) {
    if (qty > 0.001) shortages[art] = qty
  }

  if (Object.keys(shortages).length > 0) {
    return { typeCause: 'RUPTURE_COMPOSANTS', composants: shortages, message: '' }
  }

  return null
}

/** Rendu textuel d'une cause (pour affichage / debug). */
export function causeToDisplayString(cause: RetardCause): string {
  switch (cause.typeCause) {
    case 'STOCK_DISPONIBLE_NON_ALLOUE':
      return 'Stock disponible — non alloué'
    case 'ATTENTE_RECEPTION_FOURNISSEUR':
      return 'Attente réception fournisseur'
    case 'AUCUN_OF_PLANIFIE':
      return 'Aucun OF planifié'
    case 'RETARD_ORDONNANCEMENT':
      return cause.joursRetard ? `OF planifié en retard — ${cause.joursRetard} j` : 'OF planifié en retard'
    case 'RUPTURE_COMPOSANTS': {
      const parts = Object.entries(cause.composants)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([art, qty]) => `${art} x${fmtQty(qty)}`)
      return 'Rupture composants: ' + parts.join(', ')
    }
    default:
      return cause.message || ''
  }
}

function fmtQty(value: number): string {
  const rounded = Math.round(value * 1000) / 1000
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return String(Math.round(rounded))
  return String(rounded)
}

/**
 * Renseigne `cause` sur chaque assignment en RETARD_PROD (mutation in place + retour).
 * Wrapper de confort pour la composition.
 */
export function attachCauses(
  assignments: StatusAssignment[],
  stockProvider: StockProvider,
  ofMatcher: OfMatcherPort,
  bomNavigator: BomNavigator,
): StatusAssignment[] {
  for (const a of assignments) {
    if (a.status !== 'RETARD_PROD') continue
    a.cause = analyzeRetardCause(a.line, stockProvider, ofMatcher, bomNavigator)
  }
  return assignments
}

// ---------------------------------------------------------------------------
// palette_calculator
// ---------------------------------------------------------------------------

/** Capacité camion semi-remorque standard. */
export const EUROP_PER_CAMION = 33
export const EH_PER_CAMION = 26
/** Ratio d'équivalence EasyHome → europalette (≈ 1.27). */
export const EH_TO_EUROP_RATIO = EUROP_PER_CAMION / EH_PER_CAMION

export interface PaletteLigne {
  numCommande: string
  article: string
  designation: string
  typeCommande: string
  statut: SuiviStatus
  qteRestante: number
  unitesParPal: number
  typePalette: string
  gamme: string
  nbPalettes: number
  dateExpedition: string
}

export interface PaletteDay {
  date: string
  dateFmt: string
  palettesStandard: number
  palettesEasyhome: number
  totalPalettes: number
  camions: number
  nbLignes: number
}

export interface PaletteSummary {
  lignes: PaletteLigne[]
  byDay: PaletteDay[]
  moyenne: { parJour: number; parSemaine: number }
  totaux: {
    palettesStandard: number
    palettesEasyhome: number
    totalPalettes: number
    camions: number
    totalLignes: number
  }
}

function computeCamions(palettesStd: number, palettesEh: number): number {
  const equiv = palettesStd + palettesEh * EH_TO_EUROP_RATIO
  return Math.ceil(equiv / EUROP_PER_CAMION)
}

/** Tronque une date à minuit local (comparaisons jour à jour). */
function atMidnight(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function ddmm(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0')
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${m}`
}

/**
 * Résumé palettes / camions pour les commandes MTS et MTO, horizon 15 jours glissants.
 * - nb_palettes = CEIL(qte_restante / unites_par_pal)
 * - 2 types : 800x1200 (Standard), 1000x1200 (EasyHome)
 * - camions = CEIL((std + easyhome × 1.27) / 33)
 * - moyennes calculées sur jours ouvrés (Lun–Ven) ; par_semaine = par_jour × 5
 */
export function computePaletteSummary(
  assignments: StatusAssignment[],
  paletteProvider: PaletteInfoProvider,
  referenceDate: Date,
): PaletteSummary {
  const empty: PaletteSummary = {
    lignes: [],
    byDay: [],
    moyenne: { parJour: 0, parSemaine: 0 },
    totaux: {
      palettesStandard: 0,
      palettesEasyhome: 0,
      totalPalettes: 0,
      camions: 0,
      totalLignes: 0,
    },
  }
  if (assignments.length === 0) return empty

  const refDate = atMidnight(referenceDate)
  const horizonEnd = new Date(refDate)
  horizonEnd.setDate(horizonEnd.getDate() + 14) // 15 jours glissants

  const lignes: PaletteLigne[] = []
  const palettesByType = { '800x1200': 0, '1000x1200': 0 }

  // Initialise les 15 jours.
  const byDay = new Map<string, { date: Date; palettesStandard: number; palettesEasyhome: number; nbLignes: number }>()
  for (let i = 0; i < 15; i++) {
    const d = new Date(refDate)
    d.setDate(d.getDate() + i)
    byDay.set(isoDay(d), { date: d, palettesStandard: 0, palettesEasyhome: 0, nbLignes: 0 })
  }

  for (const a of assignments) {
    const line = a.line
    if (line.typeCommande !== 'MTS' && line.typeCommande !== 'MTO') continue
    if (!line.dateExpedition) continue
    const dt = atMidnight(line.dateExpedition)
    if (dt < refDate || dt > horizonEnd) continue
    const qte = line.qteRestante
    if (qte <= 0) continue

    const pal = paletteProvider.getPaletteInfo(line.article)
    if (pal === null) continue

    const nbPal = Math.ceil(qte / pal.unitesParPal)

    lignes.push({
      numCommande: line.numCommande,
      article: line.article,
      designation: line.designation,
      typeCommande: line.typeCommande,
      statut: a.status,
      qteRestante: qte,
      unitesParPal: pal.unitesParPal,
      typePalette: pal.typePalette,
      gamme: pal.gamme,
      nbPalettes: nbPal,
      dateExpedition: isoDay(dt),
    })

    palettesByType[pal.typePalette] += nbPal

    const dayKey = isoDay(dt)
    const day = byDay.get(dayKey)
    if (day) {
      day.nbLignes += 1
      if (pal.typePalette === '800x1200') day.palettesStandard += nbPal
      else day.palettesEasyhome += nbPal
    }
  }

  const byDayList: PaletteDay[] = [...byDay.keys()]
    .sort()
    .map((key) => {
      const d = byDay.get(key)!
      const total = d.palettesStandard + d.palettesEasyhome
      return {
        date: isoDay(d.date),
        dateFmt: ddmm(d.date),
        palettesStandard: d.palettesStandard,
        palettesEasyhome: d.palettesEasyhome,
        totalPalettes: total,
        camions: computeCamions(d.palettesStandard, d.palettesEasyhome),
        nbLignes: d.nbLignes,
      }
    })

  // Moyenne sur jours ouvrés (Lun=1..Ven=5).
  const joursOuvres = byDayList.filter((d) => {
    const wd = new Date(`${d.date}T00:00:00`).getDay()
    return wd >= 1 && wd <= 5
  })
  const totalCamionsOuvres = joursOuvres.reduce((s, d) => s + d.camions, 0)
  const nbJoursOuvres = Math.max(1, joursOuvres.length)
  const moyenneParJour = totalCamionsOuvres / nbJoursOuvres
  const moyenneParSemaine = moyenneParJour * 5

  return {
    lignes,
    byDay: byDayList,
    moyenne: {
      parJour: Math.round(moyenneParJour * 10) / 10,
      parSemaine: Math.round(moyenneParSemaine * 10) / 10,
    },
    totaux: {
      palettesStandard: palettesByType['800x1200'],
      palettesEasyhome: palettesByType['1000x1200'],
      totalPalettes: palettesByType['800x1200'] + palettesByType['1000x1200'],
      camions: computeCamions(palettesByType['800x1200'], palettesByType['1000x1200']),
      totalLignes: lignes.length,
    },
  }
}

// ---------------------------------------------------------------------------
// retard_charge_calculator
// ---------------------------------------------------------------------------

export interface PosteCharge {
  heures: number
  libelle: string
}

/**
 * Heures cumulées de retard par poste de charge, pour chaque ligne RETARD_PROD.
 *
 * Charge directe (gamme du PF) vs récursive (si le 1er composant en rupture est dans un
 * sous-ensemble fabriqué, niveau > 1). Agrégation {poste: {heures, libelle}}.
 *
 * `attachCauses()` doit avoir renseigné `cause` en amont pour discriminer direct/récursif.
 */
export function computeRetardCharge(
  assignments: StatusAssignment[],
  bomNavigator: BomNavigator,
  chargeCalculator: ChargeCalculatorPort,
): Record<string, PosteCharge> {
  const chargeByPoste = new Map<string, number>()
  const libelleByPoste = new Map<string, string>()

  for (const a of assignments) {
    if (a.status !== 'RETARD_PROD') continue
    const { article, qteRestante: qte } = a.line
    if (!article || qte <= 0) continue

    let isRecursive = false
    if (a.cause && a.cause.typeCause === 'RUPTURE_COMPOSANTS') {
      const firstComp = Object.keys(a.cause.composants)[0]
      if (firstComp) {
        isRecursive = bomNavigator.isComponentInSubassembly(firstComp, article)
      }
    }

    let chargeMap: Record<string, number>
    try {
      chargeMap = isRecursive
        ? chargeCalculator.calculateRecursiveCharge(article, qte)
        : chargeCalculator.calculateDirectCharge(article, qte)
    } catch {
      continue
    }

    for (const [poste, hours] of Object.entries(chargeMap)) {
      if (chargeCalculator.isValidPoste(poste) && hours > 0) {
        chargeByPoste.set(poste, (chargeByPoste.get(poste) ?? 0) + hours)
        if (!libelleByPoste.has(poste)) {
          libelleByPoste.set(poste, chargeCalculator.getPosteLibelle(poste))
        }
      }
    }
  }

  const result: Record<string, PosteCharge> = {}
  for (const poste of [...chargeByPoste.keys()].sort()) {
    result[poste] = {
      heures: Math.round((chargeByPoste.get(poste) ?? 0) * 100) / 100,
      libelle: libelleByPoste.get(poste) ?? '',
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// action_recommender
//
// Pas de source Python correspondante sur master (le `action_recommender.py` décrit
// dans l'issue #19 n'existe pas dans l'arbre committé). On porte donc une logique
// minimale et explicite : mapping statut × cause → actions + sévérité.
// ---------------------------------------------------------------------------

export type ActionSeverity = 'info' | 'warning' | 'critical'

export interface ActionRecommendation {
  actions: string[]
  severity: ActionSeverity
}

export function recommendActions(assignment: StatusAssignment): ActionRecommendation {
  const { status, alerteCqStatut, cause } = assignment

  switch (status) {
    case 'A_EXPEDIER':
      return {
        severity: 'info',
        actions: alerteCqStatut
          ? ['Vérifier la levée du contrôle qualité avant expédition', 'Expédier']
          : ['Expédier'],
      }

    case 'ALLOCATION_A_FAIRE':
      return {
        severity: 'warning',
        actions: alerteCqStatut
          ? ["Réaliser l'allocation ERP (stock partiellement sous CQ)"]
          : ["Réaliser l'allocation ERP"],
      }

    case 'RAS':
      return { severity: 'info', actions: [] }

    case 'RETARD_PROD':
      return { severity: 'critical', actions: retardActions(cause) }
  }
}

function retardActions(cause: RetardCause | null): string[] {
  if (cause === null) return ['Analyser la cause du retard']
  switch (cause.typeCause) {
    case 'STOCK_DISPONIBLE_NON_ALLOUE':
      return ['Allouer le stock disponible à la commande']
    case 'ATTENTE_RECEPTION_FOURNISSEUR':
      return ['Relancer le fournisseur / accélérer la réception']
    case 'AUCUN_OF_PLANIFIE':
      return ['Créer et planifier un OF']
    case 'RUPTURE_COMPOSANTS': {
      const comps = Object.entries(cause.composants)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([art, qty]) => `${art} (manque ${fmtQty(qty)})`)
      return ['Approvisionner les composants en rupture : ' + comps.join(', ')]
    }
    default:
      return ['Analyser la cause du retard']
  }
}

/** Compte les statuts d'un lot d'assignments. */
export function buildStatusCounts(statuses: SuiviStatus[]): Record<SuiviStatus, number> {
  const counts: Record<SuiviStatus, number> = {
    A_EXPEDIER: 0,
    ALLOCATION_A_FAIRE: 0,
    RETARD_PROD: 0,
    RAS: 0,
  }
  for (const s of statuses) counts[s]++
  return counts
}
