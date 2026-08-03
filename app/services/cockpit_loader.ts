import boardDataset from '#services/board_dataset'
import operationsTrkReplicaRepository from '#repositories/operations_trk_replica_repository'
import replicaGate, { type GateVerdict } from '#services/replica_gate'
import { operationsTrkWindow } from '#services/replica_sync_service'
import {
  loadPosteEngagement,
  resolvePoste,
  weeklyCapacityOf,
  type PosteEngagement,
} from '#services/poste_engagement_loader'
import { OverrideStore } from '#services/override_store'
import { atelierLabel } from '#app/domain/atelier'
import { capDay, capacityPeriod } from '#app/domain/capacity'
import capacityCalendar from '#services/capacity_calendar_service'
import type { WorkingCalendar } from '#app/domain/working_calendar'
import {
  detecterAnomaliesPoste,
  type AnomaliePoste,
  type AnomaliesPosteResultat,
} from '#app/domain/cockpit_anomalies'
import {
  adherenceProgramme,
  fiabiliteTempsGamme,
  lundiIso,
  mixArticles,
  type AdherenceSemaine,
  type FiabilitePoste,
  type MixArticle,
} from '#app/domain/cockpit_analyses'
import {
  estPosteProduction,
  heuresConvertiesParJour,
  palettesRealisees,
  productionParMois,
  productionParSemaine,
  productionRealiseeParJour,
  syntheseParOf,
  tronquerPoste,
  type PalettesMaille,
  type PointageTrk,
  type ProductionRealisee,
} from '#app/domain/production_realisee'
import { calcPalettes } from '#app/domain/receptions'
import {
  groupGammeByArticle,
  hoursForQuantity,
  type GammeOperation,
} from '#app/domain/models/gamme'
import type { ManufacturingOrder } from '#repositories/of_repository'
import type { Article } from '#app/domain/models/article'
import { isoDay } from '#app/utils/dates'
import { cacheNs } from '#services/cache_ns'
import { loadControleProdData } from '#services/controle_prod_loader'
import { loadOfASolderData } from '#services/of_a_solder_loader'

/**
 * Cockpit poste (#119) — sélecteur, identité, passé constaté, engagement.
 *
 * Le passé constaté vient de `operations_trk_replica` et JAMAIS de la voie
 * directe : si le portail refuse la réplique (pas encore ingérée, run en retard,
 * autre environnement X3), le cockpit affiche l'indisponibilité plutôt que
 * d'interroger MFGOPETRK en direct. L'engagement, lui, vient du pipeline #46
 * (`loadPosteEngagement`) qui a ses propres sources ORDERS/gammes.
 *
 * La production réalisée et sa conversion en heures sont du DOMAINE PUR
 * (`app/domain/production_realisee.ts`) : le loader assemble réplique + gamme +
 * capacité, il ne recalcule rien.
 */

/** Poste présélectionné à l'ouverture — celui qui a motivé l'écran (#119). */
const POSTE_DEFAUT = 'PP_093'

const COCKPIT_TTL = 5 * 60 * 1000

export interface CockpitPosteListItem {
  code: string
  label: string
}

export interface CockpitReplicaState {
  disponible: boolean
  /** Pourquoi elle ne l'est pas — null quand elle sert. */
  raison: GateVerdict['reason']
  dernierRunIso: string | null
}

export interface CockpitPostesPayload {
  postes: CockpitPosteListItem[]
  defaut: string | null
  /** Fenêtre de pointage couverte par la réplique (6 mois glissants). */
  fenetre: { fromIso: string; toIso: string }
  replica: CockpitReplicaState
}

export interface CockpitPosteInfo {
  code: string
  label: string
  /** Atelier de rattachement (STOLOC) — même rattachement que /charge et le
   *  séquenceur. Vide si le poste est inconnu du référentiel WORKSTATIO. */
  atelier: string
  atelierLabel: string
  /** Capacité hebdomadaire théorique (h) — la même formule et le même nombre
   *  qu'au séquenceur (WORKSTATIO + TABWEEDIA, #35/#37). Null si poste inconnu
   *  ou sans capacité. */
  capaciteHebdoHeures: number | null
  /** Régime du schéma horaire : DAYCAP Lundi→Dimanche (heures brutes, avant
   *  efficience/utilisation). Null si poste inconnu du référentiel. */
  regimeHebdo: number[] | null
  /** Dernier pointage du poste dans la fenêtre répliquée — null si aucun. */
  dernierPointageIso: string | null
}

/** Un mois du graphe heures vs capacité : trois lectures en heures. */
export interface CockpitHeuresMois {
  mois: string
  /** Capacité nette TABWEEDIA sur le mois, bornée à la fenêtre répliquée. */
  capacite: number
  /** Heures réellement pointées (opératoire + réglage). */
  heuresPointees: number
  /** Quantité produite convertie en heures de gamme — convention de gestion. */
  heuresConverties: number
}

/** Un OF « terminé » du point de vue du poste : pointé dans la fenêtre et plus
 *  en cours. `dernierJourIso` tient lieu de date de sortie — approximation
 *  documentée : la réplique ne connaît pas la clôture X3. */
export interface CockpitOfTermine {
  numOf: string
  article: string | null
  designation: string | null
  qty: number
  heures: number
  dernierJourIso: string
  palettes: number | null
}

/**
 * Le passé constaté d'un poste sur la fenêtre répliquée. Null quand la réplique
 * est indisponible : jamais de repli en voie directe sur les pointages.
 *
 * Les trois mailles (jour/semaine/mois) sont servies précalculées — le graphe
 * bascule de l'une à l'autre sans retraitement côté client.
 */
export interface CockpitPasse {
  nbPointages: number
  productionParJour: ProductionRealisee[]
  productionParSemaine: ProductionRealisee[]
  productionParMois: ProductionRealisee[]
  /** Équivalent palette par maille — null = absence de coefficient (#119). */
  palettes: { parJour: PalettesMaille[]; parSemaine: PalettesMaille[]; parMois: PalettesMaille[] }
  heuresParMois: CockpitHeuresMois[]
  ofTermines: CockpitOfTermine[]
}

/**
 * Anomalies du poste qui ne viennent PAS de la réplique : écarts de
 * déclaration (#95) et OF à solder. Chargées à part, à la demande.
 */
export interface CockpitAnomaliesUsine {
  ecartsDeclaration: AnomaliePoste[]
  ofsASolder: AnomaliePoste[]
}

export interface CockpitAnalyses {
  fiabilite: FiabilitePoste
  adherence: AdherenceSemaine[]
  mix: MixArticle[]
}

export interface CockpitPostePayload {
  poste: CockpitPosteInfo
  /** Engagement futur — pipeline #46 réutilisé tel quel, jamais réimplémenté. */
  engagement: PosteEngagement | null
  /** Passé constaté — réplique de pointages + domaine pur, lot 4. */
  passe: CockpitPasse | null
  /** Anomalies de pointage (#119, lot 5) — null si la réplique est indisponible. */
  anomalies: AnomaliesPosteResultat | null
  /** Fiabilité gamme, adhérence programme, mix articles (#119, lot 6). */
  analyses: CockpitAnalyses | null
  fenetre: { fromIso: string; toIso: string }
  replica: CockpitReplicaState
  x3Error: string | null
}

/** Fenêtre de pointage en ISO : `[fromIso, toExclIso)` et `toIso` (dernier jour
 *  inclus) pour l'affichage. */
function fenetrePointage(): { fromIso: string; toIso: string; toExclIso: string } {
  const { from, to } = operationsTrkWindow()
  const toExcl = new Date(to)
  toExcl.setDate(toExcl.getDate() + 1)
  return { fromIso: isoDay(from), toIso: isoDay(to), toExclIso: isoDay(toExcl) }
}

/** Tri numérique du code tronqué (PP_2 avant PP_10). */
const posteNum = (code: string): number => {
  const m = /^(?:PP|PE)_(\d+)$/.exec(tronquerPoste(code))
  return m ? Number.parseInt(m[1], 10) : 0
}

/**
 * Liste des postes du sélecteur : postes de production (`PP_`/`PE_` + digits)
 * ayant pointé dans la fenêtre répliquée, dédupliqués par code tronqué.
 * La réplique est la source — un poste pointé mais absent du référentiel
 * gammes doit rester sélectionnable (libellé = code). À l'inverse, un poste
 * du référentiel sans aucun pointage n'a pas sa place ici.
 */
export async function loadCockpitPostes(force = false): Promise<CockpitPostesPayload> {
  const cache = cacheNs('cockpit')
  const key = 'postes:v2'
  if (force) await cache.delete({ key })
  return cache.getOrSet({
    key,
    ttl: COCKPIT_TTL,
    factory: async (): Promise<CockpitPostesPayload> => {
      const fen = fenetrePointage()
      const fenetre = { fromIso: fen.fromIso, toIso: fen.toIso }

      const verdict = await replicaGate.verdict('operations_trk_replica')
      const replica: CockpitReplicaState = {
        disponible: verdict.source === 'replica',
        raison: verdict.reason,
        dernierRunIso: verdict.lastFullRunAt,
      }
      if (!replica.disponible) return { postes: [], defaut: null, fenetre, replica }

      const codes = await operationsTrkReplicaRepository.getDistinctWorkstations(
        fen.fromIso,
        fen.toExclIso
      )

      // Libellé de gamme, PAS la description WORKSTATIO — même convention que le
      // séquenceur et le board, deux sources qui peuvent diverger.
      const ref = await boardDataset.getReferential()
      const wstLabels = new Map<string, string>()
      for (const g of ref.gamme) {
        if (!g.workstation) continue
        const t = tronquerPoste(g.workstation)
        if (!wstLabels.has(t)) wstLabels.set(t, g.workstationLabel || t)
      }

      const seen = new Set<string>()
      const postes = codes
        .filter((c) => estPosteProduction(c))
        .map((c) => tronquerPoste(c))
        .filter((c) => {
          if (seen.has(c)) return false
          seen.add(c)
          return true
        })
        .sort((a, b) => posteNum(a) - posteNum(b))
        .map((code) => ({ code, label: wstLabels.get(code) ?? code }))

      const defaut = postes.some((p) => p.code === POSTE_DEFAUT)
        ? POSTE_DEFAUT
        : (postes[0]?.code ?? null)

      return { postes, defaut, fenetre, replica }
    },
  })
}

/** Liste des mois (YYYY-MM) couverts par la fenêtre, bornes incluses. */
function moisDeLaFenetre(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  const cur = fromIso.slice(0, 7)
  const last = toIso.slice(0, 7)
  let [y, m] = cur.split('-').map(Number)
  const [ly, lm] = last.split('-').map(Number)
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

/** Cadence de gamme par (article, poste tronqué) — première rencontrée, rate > 0. */
function cadenceParArticlePoste(
  gamme: { article: string; workstation: string; rate: number }[]
): Map<string, number> {
  const cadenceParCle = new Map<string, number>()
  for (const g of gamme) {
    if (!g.workstation || g.rate <= 0) continue
    const cle = `${g.article}#${tronquerPoste(g.workstation)}`
    if (!cadenceParCle.has(cle)) cadenceParCle.set(cle, g.rate)
  }
  return cadenceParCle
}

/** Poste du référentiel — shape minimale pour la capacité. */
type CockpitWorkstation = Parameters<typeof capacityPeriod>[0] & {
  code: string
  stockLocation?: string
  dailyCapacity: number[]
}

/**
 * Tous les WORKSTATIO dont le code tronqué = poste retenu.
 * La fusion `PP_093S` → `PP_093` exige de SOMMER leurs capacités — un seul
 * match (premier trouvé) laissait la courbe heures/capacité incohérente
 * (contre-revue #119, point B).
 */
function workstationsDuPosteTronque(
  poste: string,
  workstations: { code: string }[]
): CockpitWorkstation[] {
  return workstations.filter((w) => tronquerPoste(w.code) === poste) as CockpitWorkstation[]
}

/** Capacité hebdo nette sommée sur tous les jumeaux du code tronqué. */
function capaciteHebdoTronquee(
  poste: string,
  workstations: Parameters<typeof weeklyCapacityOf>[1]
): number | null {
  let total = 0
  let any = false
  for (const w of workstations) {
    if (tronquerPoste(w.code) !== poste) continue
    const c = weeklyCapacityOf(w.code, [w])
    if (c === null) continue
    total += c
    any = true
  }
  return any ? Math.round(total * 100) / 100 : null
}

/** Régime horaire hebdo sommé sur les jumeaux (Lundi→Dimanche, heures brutes). */
function regimeHebdoTronque(wsts: CockpitWorkstation[]): number[] | null {
  if (wsts.length === 0) return null
  const total = [0, 0, 0, 0, 0, 0, 0]
  for (const w of wsts) {
    for (let i = 0; i < 7; i++) total[i] += w.dailyCapacity[i] ?? 0
  }
  return total.map((h) => Math.round(h * 100) / 100)
}

/**
 * Capacité période sommée — même périmètre que le réalisé tronqué, et MÊME
 * calendrier que `/charge` : fériés actifs et fermetures (#37) via
 * `calendar.factor(poste, jour)`. Sans lui, la fenêtre de 6 mois comptait la
 * fermeture d'août comme de la capacité ouverte (revue #119).
 */
function capacityPeriodTronquee(
  wsts: CockpitWorkstation[],
  from: Date,
  to: Date,
  calendar: WorkingCalendar | null
): number {
  if (wsts.length === 0 || to < from) return 0
  let total = 0
  for (const w of wsts) {
    if (!calendar) {
      total += capacityPeriod(w, from, to)
      continue
    }
    for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) {
      const jour = new Date(t)
      const facteur = calendar.factor(w, isoDay(jour))
      if (facteur <= 0) continue
      total += capDay(w, jour) * facteur
    }
  }
  return total
}

/**
 * Le passé constaté du poste : domaine pur sur les pointages déjà lus de la
 * réplique (jamais de voie directe — c'est l'appelant qui a passé le verdict).
 * La capacité du graphe vient de `capacityPeriod` (#35/#37), bornée à la
 * fenêtre répliquée, SOMMÉE sur tous les jumeaux du code tronqué.
 */
function buildPasse(opts: {
  pointages: PointageTrk[]
  fen: { fromIso: string; toIso: string; toExclIso: string }
  wsts: CockpitWorkstation[]
  gamme: { article: string; workstation: string; rate: number }[]
  usParPalette: (article: string) => number | null
  ofTermines: CockpitOfTermine[]
  /** Calendrier usine (#37) — null si sa lecture a échoué : capacité brute. */
  calendar: WorkingCalendar | null
}): CockpitPasse {
  const { pointages } = opts
  if (pointages.length === 0) {
    return {
      nbPointages: 0,
      productionParJour: [],
      productionParSemaine: [],
      productionParMois: [],
      palettes: { parJour: [], parSemaine: [], parMois: [] },
      heuresParMois: [],
      ofTermines: [],
    }
  }

  // Domaine pur : OPENUM max + mailles j/s/m.
  const maillesJour = productionRealiseeParJour(pointages)
  const prodSemaine = productionParSemaine(maillesJour)
  const prodMois = productionParMois(maillesJour)
  const palettes = palettesRealisees(pointages, opts.usParPalette)

  const cadenceParCle = cadenceParArticlePoste(opts.gamme)
  const convertiesJour = heuresConvertiesParJour(
    pointages,
    (article, poste) => cadenceParCle.get(`${article}#${poste}`) ?? null
  )

  // Agrégat heures par mois : pointées (des mailles jour) + converties + capacité.
  const heuresPointeesParMois = new Map<string, number>()
  for (const m of maillesJour) {
    const mois = m.date.slice(0, 7)
    heuresPointeesParMois.set(mois, (heuresPointeesParMois.get(mois) ?? 0) + m.heures)
  }
  const convertiesParMois = new Map<string, number>()
  for (const [jour, h] of convertiesJour) {
    const mois = jour.slice(0, 7)
    convertiesParMois.set(mois, (convertiesParMois.get(mois) ?? 0) + h)
  }

  const from = new Date(`${opts.fen.fromIso}T00:00:00`)
  const to = new Date(`${opts.fen.toIso}T00:00:00`)
  const heuresParMois: CockpitHeuresMois[] = moisDeLaFenetre(opts.fen.fromIso, opts.fen.toIso).map(
    (mois) => {
      const debutMois = new Date(`${mois}-01T00:00:00`)
      const finMois = new Date(debutMois)
      finMois.setMonth(finMois.getMonth() + 1)
      finMois.setDate(finMois.getDate() - 1)
      const debut = debutMois > from ? debutMois : from
      const fin = finMois < to ? finMois : to
      const capacite = capacityPeriodTronquee(opts.wsts, debut, fin, opts.calendar)
      return {
        mois,
        capacite: Math.round(capacite * 100) / 100,
        heuresPointees: Math.round((heuresPointeesParMois.get(mois) ?? 0) * 100) / 100,
        heuresConverties: Math.round((convertiesParMois.get(mois) ?? 0) * 100) / 100,
      }
    }
  )

  return {
    nbPointages: pointages.length,
    productionParJour: maillesJour,
    productionParSemaine: prodSemaine,
    productionParMois: prodMois,
    palettes,
    heuresParMois,
    ofTermines: opts.ofTermines,
  }
}

/** Statuts OF considérés « en cours » — les mêmes que l'engagement (#46). */
const STATUTS_EN_COURS = new Set([1, 2, 3])

/**
 * Tous les OF ouverts (statuts 1/2/3), une seule extraction. Le rattachement
 * poste (override sinon première op. de gamme) se décide à l'appelant.
 */
async function ofsOuverts(gamme: GammeOperation[]): Promise<{
  all: ManufacturingOrder[]
  resolve: (mo: ManufacturingOrder) => string | null
}> {
  const [ord, overrides] = await Promise.all([
    boardDataset.getOrders(),
    new OverrideStore().getAll(),
  ])
  const opsByArticle = groupGammeByArticle(gamme)
  const overrideMap = new Map(overrides.map((o) => [o.numOf, o]))
  const seen = new Set<string>()
  const all: ManufacturingOrder[] = []
  for (const mo of ord.mos) {
    if (!STATUTS_EN_COURS.has(Number(mo.status))) continue
    if (seen.has(mo.numOf)) continue
    seen.add(mo.numOf)
    all.push(mo)
  }
  return {
    all,
    resolve: (mo) => resolvePoste(mo, overrideMap, opsByArticle),
  }
}

/** openum sélectionné par OF sur ce poste (OPENUM max quantifié). */
function selectionOpenumParOf(pointages: PointageTrk[], poste: string): Map<string, number> {
  const selection = new Map<string, number>()
  for (const p of pointages) {
    if (tronquerPoste(p.cplwst) !== poste) continue
    if (p.cplqty <= 0) continue
    const cur = selection.get(p.numOf)
    if (cur === undefined || p.openum > cur) selection.set(p.numOf, p.openum)
  }
  return selection
}

/**
 * Quantité déclarée SUR LE POSTE (revue #119, 2.3) : MFGOPE.CPLQTY de
 * l'opération sélectionnée (OPENUM max quantifié sur ce poste), pas la somme
 * toutes opérations / tous postes.
 */
function qtyDeclareeSurPoste(
  operations: { mfgnum: string; openum: number; cplqty: number }[],
  openumParOf: Map<string, number>
): Map<string, number> {
  const declareeParOf = new Map<string, number>()
  for (const op of operations) {
    if (openumParOf.get(op.mfgnum) !== op.openum) continue
    declareeParOf.set(op.mfgnum, (declareeParOf.get(op.mfgnum) ?? 0) + (op.cplqty || 0))
  }
  return declareeParOf
}

/**
 * Écarts de déclaration (#95) et OF à solder du poste — les deux familles
 * d'anomalies qui ne vivent PAS sur la réplique.
 *
 * Servies par un endpoint SÉPARÉ, à la demande : `controle_prod_loader` et
 * `of_a_solder_loader` interrogent X3 en direct. Les laisser dans le payload
 * du poste mettait deux pipelines lourds devant l'affichage et cassait le
 * critère « la page tient sur la réplique sans requête X3 en ligne » (#119).
 * Même parti que les onglets de `/controle-prod`.
 */
export async function loadCockpitAnomaliesUsine(
  poste: string,
  force = false
): Promise<CockpitAnomaliesUsine> {
  const safe = tronquerPoste(poste.trim())
  if (!estPosteProduction(safe)) return { ecartsDeclaration: [], ofsASolder: [] }

  const [controle, solder] = await Promise.all([
    loadControleProdData(force).catch(() => null),
    loadOfASolderData(force).catch(() => null),
  ])

  const ecartsDeclaration = (controle?.rows ?? [])
    .filter((r) => tronquerPoste(r.poste ?? '') === safe)
    .map((r): AnomaliePoste => ({
      kind: 'ecart_declaration',
      numOf: r.numOf,
      article: r.article,
      designation: r.designation,
      dateDebutIso: r.dateDebutIso,
      dernierPointageIso: null,
      jours: null,
      qtyDeclaree: r.ecart,
      heuresPointees: null,
      heuresTheoriques: null,
    }))

  const ofsASolder = (solder?.rows ?? [])
    .filter((r) => tronquerPoste(r.poste ?? '') === safe)
    .map((r): AnomaliePoste => ({
      kind: 'of_a_solder',
      numOf: r.numOf,
      article: r.article,
      designation: r.designation,
      dateDebutIso: r.dateDebutIso,
      dernierPointageIso: r.dernierPointageIso,
      jours: r.joursDepuisPointage,
      qtyDeclaree: null,
      heuresPointees: null,
      heuresTheoriques: null,
    }))

  return { ecartsDeclaration, ofsASolder }
}

/**
 * Anomalies de pointage du poste (#119, lot 5). Domaine pur sur :
 *  - les OF EN COURS rattachés au poste (1ʳᵉ op.) + ceux pointés ici ;
 *  - les quantités déclarées sur les ops du poste (MFGOPE × openums gamme) ;
 *  - les pointages du poste déjà lus de la réplique.
 *
 * Les écarts (#95) et les OF à solder ne sont PAS ici : ils viennent d'X3 et
 * sont servis à part (`loadCockpitAnomaliesUsine`).
 */
async function buildAnomalies(opts: {
  poste: string
  pointages: PointageTrk[]
  gamme: GammeOperation[]
  enCours: ManufacturingOrder[]
}): Promise<AnomaliesPosteResultat> {
  const { enCours } = opts
  const openumParOf = selectionOpenumParOf(opts.pointages, opts.poste)

  if (enCours.length === 0) {
    return detecterAnomaliesPoste({
      ofs: [],
      pointages: opts.pointages,
      heuresTheoriquesPour: () => 0,
      aujourdhuiIso: isoDay(new Date()),
    })
  } else {
    let declareeParOf = new Map<string, number>()
    try {
      const operations = await boardDataset.getOperations(enCours.map((m) => m.numOf))
      declareeParOf = qtyDeclareeSurPoste(operations, openumParOf)
    } catch {
      // Déclarations indisponibles : le détecteur 3 tournera sur des quantités à
      // zéro (donc muet) plutôt que de faire échouer tout le payload.
    }

    const cadenceParCle = cadenceParArticlePoste(opts.gamme)

    return detecterAnomaliesPoste({
      ofs: enCours.map((mo) => ({
        numOf: mo.numOf,
        article: mo.article,
        designation: mo.designation,
        dateDebutIso: mo.startDate ? isoDay(mo.startDate) : null,
        qtyDeclaree: declareeParOf.get(mo.numOf) ?? 0,
      })),
      pointages: opts.pointages,
      heuresTheoriquesPour: (article, qty) =>
        hoursForQuantity({ rate: cadenceParCle.get(`${article}#${opts.poste}`) ?? 0 }, qty),
      aujourdhuiIso: isoDay(new Date()),
    })
  }
}

/**
 * OF « terminés » du point de vue du poste : pointés dans la fenêtre et qui ne
 * sont PLUS en cours (tous postes). La date de sortie est approchée par le
 * dernier pointage — la réplique ne connaît pas la clôture X3.
 */
function buildOfTermines(opts: {
  pointages: PointageTrk[]
  enCoursNums: Set<string>
  designationParArticle: Map<string, string>
  usParPalette: (article: string) => number | null
}): CockpitOfTermine[] {
  const termines: CockpitOfTermine[] = []
  for (const of of syntheseParOf(opts.pointages)) {
    if (opts.enCoursNums.has(of.numOf)) continue
    const coef = of.article ? opts.usParPalette(of.article) : null
    termines.push({
      numOf: of.numOf,
      article: of.article,
      designation: of.article ? (opts.designationParArticle.get(of.article) ?? null) : null,
      qty: of.qty,
      heures: Math.round(of.heures * 100) / 100,
      dernierJourIso: of.dernierJour,
      palettes: coef && coef > 0 ? calcPalettes(of.qty, coef) : null,
    })
  }
  return termines.sort((a, b) => b.dernierJourIso.localeCompare(a.dernierJourIso))
}

/**
 * Analyses du poste (#119, lot 6) : fiabilité des temps de gamme, adhérence au
 * programme, mix articles. Domaine pur ; l'assemblage prépare seulement les
 * entrées (cadences gamme, coefficient palette, semaines de la fenêtre).
 *
 * Adhérence : les semaines couvertes sont celles de la fenêtre répliquée,
 * SANS la semaine en cours (partielle, elle ferait chuter le taux à tort).
 */
async function buildAnalyses(opts: {
  poste: string
  pointages: PointageTrk[]
  gamme: GammeOperation[]
  enCours: ManufacturingOrder[]
  fen: { fromIso: string; toIso: string }
  usParPalette: (article: string) => number | null
}): Promise<CockpitAnalyses> {
  const cadenceParCle = cadenceParArticlePoste(opts.gamme)
  const cadencePour = (article: string): number | null =>
    cadenceParCle.get(`${article}#${opts.poste}`) ?? null

  const synthese = syntheseParOf(opts.pointages)

  // Semaines de la fenêtre (lundis ISO), semaine en cours exclue.
  const lundiCourant = lundiIso(opts.fen.toIso)
  const semaines = new Set<string>()
  const curseur = new Date(`${opts.fen.fromIso}T00:00:00`)
  const fin = new Date(`${opts.fen.toIso}T00:00:00`)
  for (let t = curseur.getTime(); t <= fin.getTime(); t += 86_400_000) {
    const lundi = lundiIso(isoDay(new Date(t)))
    if (lundi !== lundiCourant) semaines.add(lundi)
  }

  // OF PRÉVUS par semaine : date de lancement des OF ouverts du poste. Limite
  // assumée et affichée : ce qui est passé en stock n'est plus dans ORDERS.
  const prevusParSemaine = new Map<string, Set<string>>()
  for (const mo of opts.enCours) {
    if (!mo.startDate) continue
    const lundi = lundiIso(isoDay(mo.startDate))
    const cur = prevusParSemaine.get(lundi) ?? new Set<string>()
    cur.add(mo.numOf)
    prevusParSemaine.set(lundi, cur)
  }

  return {
    fiabilite: fiabiliteTempsGamme({ synthese, cadencePour }),
    adherence: adherenceProgramme({ prevusParSemaine, synthese, semaines: [...semaines] }),
    mix: mixArticles({ synthese, cadencePour, usParPalette: opts.usParPalette }),
  }
}

/** Lignes réplique → pointages du domaine. */
function versPointages(
  rows: Awaited<ReturnType<typeof operationsTrkReplicaRepository.getPointages>>
): PointageTrk[] {
  return rows.map((r) => ({
    numOf: r.numOf,
    openum: r.openum,
    iptdat: r.iptdat,
    cplwst: r.cplwst,
    cplqty: r.cplqty,
    opetim: r.opetim,
    settim: r.settim,
    rebut: r.rebut,
    itmrefOf: r.itmrefOf,
  }))
}

/**
 * Payload d'un poste : identité + passé constaté + anomalies + engagement. La
 * réplique indisponible n'empêche pas l'engagement (sources ORDERS/gammes
 * distinctes) — elle met seulement le passé et les anomalies à null et l'écran
 * le dira. Les pointages sont lus UNE fois et partagés passé/anomalies.
 */
export async function loadCockpitPoste(poste: string, force = false): Promise<CockpitPostePayload> {
  const safe = tronquerPoste(poste.trim())
  const cache = cacheNs('cockpit')
  const key = `poste:${safe}:v3`
  if (force) await cache.delete({ key })
  return cache.getOrSet({
    key,
    ttl: COCKPIT_TTL,
    factory: () => loadCockpitPosteUncached(safe, force),
  })
}

async function loadCockpitPosteUncached(
  safe: string,
  force: boolean
): Promise<CockpitPostePayload> {
  const fen = fenetrePointage()
  const fenetre = { fromIso: fen.fromIso, toIso: fen.toIso }

  const verdict = await replicaGate.verdict('operations_trk_replica')
  const replica: CockpitReplicaState = {
    disponible: verdict.source === 'replica',
    raison: verdict.reason,
    dernierRunIso: verdict.lastFullRunAt,
  }

  if (!estPosteProduction(safe)) {
    return {
      poste: {
        code: safe,
        label: safe,
        atelier: '',
        atelierLabel: '',
        capaciteHebdoHeures: null,
        regimeHebdo: null,
        dernierPointageIso: null,
      },
      engagement: null,
      passe: null,
      anomalies: null,
      analyses: null,
      fenetre,
      replica,
      x3Error: null,
    }
  }

  const ref = await boardDataset.getReferential()
  const wsts = workstationsDuPosteTronque(safe, ref.workstations)
  // Identité affichée : code exact s'il existe, sinon premier jumeau trié.
  const wstExact = wsts.find((w) => w.code === safe)
  const wst = wstExact ?? [...wsts].sort((a, b) => a.code.localeCompare(b.code))[0]
  let label = safe
  for (const g of ref.gamme) {
    if (tronquerPoste(g.workstation) === safe) label = g.workstationLabel || g.workstation
  }

  const pointages: PointageTrk[] = replica.disponible
    ? versPointages(
        await operationsTrkReplicaRepository.getPointages(fen.fromIso, fen.toExclIso, safe)
      )
    : []

  const info: CockpitPosteInfo = {
    code: safe,
    label,
    atelier: wst?.stockLocation ?? '',
    atelierLabel: atelierLabel(wst?.stockLocation ?? ''),
    capaciteHebdoHeures: capaciteHebdoTronquee(safe, ref.workstations),
    // Régime SOMMÉ sur les jumeaux, comme la capacité : afficher le DAYCAP d'un
    // seul poste à côté d'une capacité qui en somme deux se contredisait à
    // l'écran (revue #119).
    regimeHebdo: regimeHebdoTronque(wsts),
    dernierPointageIso:
      replica.disponible && pointages.length > 0
        ? pointages.reduce((max, p) => (p.iptdat > max ? p.iptdat : max), pointages[0].iptdat)
        : null,
  }

  let passe: CockpitPasse | null = null
  let anomalies: AnomaliesPosteResultat | null = null
  let analyses: CockpitAnalyses | null = null
  if (replica.disponible) {
    const articles = await boardDataset.getArticles().catch(() => [] as Article[])
    const designationParArticle = new Map<string, string>()
    const coefParArticle = new Map<string, number>()
    for (const a of articles) {
      if (a.description) designationParArticle.set(a.code, a.description)
      if (a.usParPalette && a.usParPalette > 0) coefParArticle.set(a.code, a.usParPalette)
    }
    const usParPalette = (article: string): number | null => coefParArticle.get(article) ?? null

    const { all: allOpen, resolve } = await ofsOuverts(ref.gamme)
    const allOpenNums = new Set(allOpen.map((m) => m.numOf))
    const enCoursPremierOp = allOpen.filter((mo) => tronquerPoste(resolve(mo) ?? '') === safe)

    // Anomalies : 1ʳᵉ op. sur ce poste + OF ouverts pointés ici (silence/heures).
    const pointageOfNums = new Set(pointages.map((p) => p.numOf))
    const seenAnom = new Set(enCoursPremierOp.map((m) => m.numOf))
    const enCoursAnomalies = [...enCoursPremierOp]
    for (const mo of allOpen) {
      if (seenAnom.has(mo.numOf)) continue
      if (!pointageOfNums.has(mo.numOf)) continue
      seenAnom.add(mo.numOf)
      enCoursAnomalies.push(mo)
    }

    const ofTermines = buildOfTermines({
      pointages,
      enCoursNums: allOpenNums,
      designationParArticle,
      usParPalette,
    })
    // Calendrier usine (#37) : fériés + fermetures, comme `/charge`. Une lecture
    // en échec ne doit pas priver l'écran de son passé : capacité brute alors.
    const calendar = await capacityCalendar
      .buildCalendar(Number(fen.fromIso.slice(0, 4)), Number(fen.toIso.slice(0, 4)))
      .catch(() => null)

    passe = buildPasse({
      pointages,
      fen,
      wsts,
      gamme: ref.gamme,
      usParPalette,
      ofTermines,
      calendar,
    })
    anomalies = await buildAnomalies({
      poste: safe,
      pointages,
      gamme: ref.gamme,
      enCours: enCoursAnomalies,
    })
    analyses = await buildAnalyses({
      poste: safe,
      pointages,
      gamme: ref.gamme,
      enCours: enCoursPremierOp,
      fen,
      usParPalette,
    })
  }

  let engagement: PosteEngagement | null = null
  let x3Error: string | null = null
  try {
    engagement = await loadPosteEngagement(safe, force)
    if (engagement.x3Error) x3Error = engagement.x3Error
    // Une seule capacité par écran : la saturation du bloc engagement se lit
    // contre la MÊME capacité que la carte d'identité et le graphe (jumeaux
    // sommés). Copie — l'objet vient d'un cache partagé avec le séquenceur.
    if (info.capaciteHebdoHeures !== null) {
      engagement = { ...engagement, weeklyCapacityHours: info.capaciteHebdoHeures }
    }
  } catch (e) {
    x3Error = (e as Error).message
  }

  return { poste: info, engagement, passe, anomalies, analyses, fenetre, replica, x3Error }
}
