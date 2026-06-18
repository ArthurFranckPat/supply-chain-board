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

export type SuiviStatus = 'A_EXPEDIER' | 'ALLOCATION_A_FAIRE' | 'RETARD_PROD' | 'RAS'
export type TypeCommande = 'MTS' | 'MTO' | 'NOR'

/** Cause structurée d'un retard de production (remplace l'ancien parsing textuel). */
export type CauseType =
  | 'STOCK_DISPONIBLE_NON_ALLOUE'
  | 'ATTENTE_RECEPTION_FOURNISSEUR'
  | 'AUCUN_OF_PLANIFIE'
  | 'RUPTURE_COMPOSANTS'
  | 'INCONNUE'

export interface RetardCause {
  typeCause: CauseType
  /** {article_composant: qté_manquante} — non vide seulement pour RUPTURE_COMPOSANTS. */
  composants: Record<string, number>
  message: string
}

/** Un emplacement physique de stock rattaché à une ligne de commande. */
export interface Emplacement {
  nom: string
  hum?: string | null
  dateMiseEnStock?: Date | null
  qtePalette?: number | null
}

export interface OrderLine {
  numCommande: string
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
  /** Emplacements de stock (zone d'expédition). Vide si la donnée ERP n'est pas chargée. */
  emplacements?: Emplacement[]
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

/** Emplacements considérés « zone d'expédition » : quai, stock magasin, expédition. */
const ZONE_EXPEDITION_PATTERN = /QUAI|SM|EXP|S9C|S3C/i

export function besoinNet(line: OrderLine): number {
  return Math.max(0, line.qteRestante - line.qteAllouee)
}

/**
 * True si au moins un emplacement de la ligne est en zone d'expédition.
 * Si la donnée emplacement n'est pas chargée (champ ERP manquant — cf. ENRICHMENT_TODO),
 * retourne false → is_retard se comporte comme avant l'enrichissement.
 */
export function enZoneExpedition(line: OrderLine, pattern: RegExp = ZONE_EXPEDITION_PATTERN): boolean {
  return (line.emplacements ?? []).some((e) => pattern.test(e.nom))
}

/**
 * Retard = date d'expédition passée ET pas en zone d'expédition.
 * (Le port TS précédent ignorait la zone — corrigé ici, cf. issue #19.)
 */
export function isRetard(line: OrderLine, refDate: Date): boolean {
  if (!line.dateExpedition) return false
  return line.dateExpedition < refDate && !enZoneExpedition(line)
}

// ---------------------------------------------------------------------------
// status_assigner
// ---------------------------------------------------------------------------

/**
 * Assigne un statut métier à chaque ligne de commande.
 *
 * Règles :
 *  - besoin_net <= 0                            → A_EXPEDIER
 *  - MTS fabriqué (pas d'allocation virtuelle)  → RETARD_PROD si retard, sinon RAS
 *  - MTS achat / MTO / NOR :
 *      couvert par stock virtuel                → ALLOCATION_A_FAIRE
 *      non couvert + retard                     → RETARD_PROD
 *      sinon                                    → RAS
 *  - Harmonisation : RAS + signal CQ consommé   → ALLOCATION_A_FAIRE
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

    // Signal CQ pour le front. Pour MTS fabriqué, on s'appuie uniquement sur l'allocation
    // déjà portée par la commande (qteAllouee) pour ne pas ré-allouer virtuellement.
    let qteSignal: number
    if (line.typeCommande === 'MTS' && line.isFabrique) {
      qteSignal = Math.min(Math.max(0, line.qteRestante), Math.max(0, line.qteAllouee))
    } else {
      qteSignal =
        besoin > 0 ? besoin : Math.min(Math.max(0, line.qteRestante), Math.max(0, line.qteAllouee))
    }
    const qteSignalCq = consumeForCqSignal(line.article, qteSignal)
    const alerteCqStatut = qteSignalCq > 0

    if (besoin <= 0) {
      assignments.push(emptyAssignment(line, 'A_EXPEDIER', besoin, alerteCqStatut))
      continue
    }

    // MTS fabriqué : hard-pegging uniquement, pas d'allocation virtuelle.
    if (line.typeCommande === 'MTS' && line.isFabrique) {
      const status: SuiviStatus = isRetard(line, referenceDate) ? 'RETARD_PROD' : 'RAS'
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
    } else if (isRetard(line, referenceDate)) {
      status = 'RETARD_PROD'
    } else {
      status = 'RAS'
    }

    // Harmonisation front : RAS + signal CQ consommé → ALLOCATION_A_FAIRE.
    if (status === 'RAS' && qteSignalCq > 0) {
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
