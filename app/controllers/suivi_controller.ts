import { type HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  assignStatuses,
  recommendActions,
  buildStatusCounts,
  causeToDisplayString,
  enZoneExpedition,
  ZONE_EXPEDITION_PATTERN,
  type OrderLine,
  type StockBreakdown,
  type StatusAssignment,
  type SuiviStatus,
  type CauseType,
} from '#app/domain/suivi'
import {
  SuiviService,
  reloadSuiviContext,
  RETARD_LOOKBACK_DAYS,
  SUIVI_FORWARD_DAYS,
} from '#services/suivi_service'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import type { OrderImpactResult } from '#app/domain/order-impacts'
import type { Article } from '#app/domain/models/article'
import type { Nomenclature } from '#app/domain/models/nomenclature'
import type { Flow } from '#app/domain/models/flow'
import { evaluateRuptures, buildOfSupply } from '#app/domain/rupture-engine'
import type { RuptureOfInput, RuptureDataset } from '#app/domain/rupture-engine'
import { isSubcontracted } from '#app/domain/rules'
import {
  groupReceptionsByArticle,
  RECEPTION_LOOKBACK_DAYS,
  RECEPTION_OVERDUE_MIN_QTY,
} from '#repositories/reception_repository'
import { resolveCoveringReception, daysBetweenIso, isoLocalDay } from '#app/domain/shortages'
import type { ReceptionRecord } from '#app/domain/recursive-checker'
import boardDataset from '#services/board_dataset'
import { atelierLabel } from '#app/domain/atelier'
import { workingDaysBetween } from '#app/domain/holidays'

/** Seuil de tolérance (jours ouvrés) pour le badge « retard récent ». */
export const LATE_TOLERANCE_DAYS = 1

/** Classe le retard selon qu'on est dans la tolérance (≤ 1 jour ouvré) ou au-delà. */
function lateSeverity(lateDays: number): 'tolerance' | 'critical' {
  return lateDays <= LATE_TOLERANCE_DAYS ? 'tolerance' : 'critical'
}

/** Une option de filtre atelier (STOLOC) : code X3 + libellé lisible. */
export interface AtelierOption {
  code: string
  label: string
}

/**
 * Map article → atelier (STOLOC du poste de sa gamme), via le référentiel partagé
 * (boardDataset, cache SWR commun avec /charge). Miroir exact de load_controller :
 * un article a un poste de gamme (dernière opération gagne), dont le STOLOC est l'atelier.
 * Dégrade en map vide si le référentiel est indisponible → pas de filtre atelier, page OK.
 */
async function buildAtelierByArticle(): Promise<Map<string, AtelierOption>> {
  const out = new Map<string, AtelierOption>()
  try {
    const ref = await boardDataset.getReferential()
    const stolocByWst = new Map((ref.workstations ?? []).map((w) => [w.code, w.stockLocation]))
    const gammeByArticle = new Map(ref.gamme.map((g) => [g.article, g]))
    for (const [article, g] of gammeByArticle) {
      const stoloc = (stolocByWst.get(g.workstation) ?? '').trim()
      if (article && stoloc) out.set(article, { code: stoloc, label: atelierLabel(stoloc) })
    }
  } catch {
    /* référentiel indispo → filtre atelier absent (dégradation silencieuse) */
  }
  return out
}

/** Ateliers distincts présents dans un lot de lignes, triés par libellé (pour les chips). */
function distinctAteliers(rows: { atelier: string; atelierLabel: string }[]): AtelierOption[] {
  const m = new Map<string, AtelierOption>()
  for (const r of rows) {
    if (r.atelier && !m.has(r.atelier)) m.set(r.atelier, { code: r.atelier, label: r.atelierLabel })
  }
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Endpoints minces « suivi des commandes » : délèguent au domaine (#app/domain/suivi)
 * via la composition (#services/suivi_service). Cf. issue #19.
 */
export default class SuiviController {
  /**
   * POST /api/v1/status/assign
   * Assignation pure à partir d'un body { lines, stock, referenceDate }.
   * (La cause de retard n'est pas calculée ici — pas de BOM/OF dans le body.)
   */
  async assign({ request }: HttpContext) {
    const {
      lines: rawLines,
      stock: stockRaw,
      referenceDate,
    } = request.only(['lines', 'stock', 'referenceDate'])

    const lines = ((rawLines ?? []) as any[]).map((l: any) => ({
      ...l,
      dateExpedition: l.dateExpedition ? new Date(l.dateExpedition) : null,
      dateLivPrevu: l.dateLivPrevu ? new Date(l.dateLivPrevu) : null,
      emplacements: l.emplacements ?? [],
    })) as OrderLine[]

    const stock = new Map<string, StockBreakdown>(
      Object.entries(stockRaw ?? {}).map(([article, bd]) => [article, bd as StockBreakdown])
    )

    const refDate = referenceDate ? new Date(referenceDate) : new Date()
    const assignments = assignStatuses(lines, stock, refDate)

    return serializeAssignments(assignments)
  }

  /**
   * POST /api/v1/status/from-latest-export
   * Charge commandes + stock + OF + BOM depuis X3 et assigne statuts + cause + signal CQ.
   */
  async fromLatestExport(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()

    const assignments = await new SuiviService().assignFromLatest(refDate)
    return serializeAssignments(assignments)
  }

  /**
   * POST /api/v1/status/palette
   * Résumé palettes / camions (horizon 15 j, jours ouvrés). Délègue au domaine.
   */
  async palette(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()
    return new SuiviService().paletteSummary(refDate)
  }

  /**
   * POST /api/v1/status/retard-charge
   * Charge de retard par poste (directe vs récursive). Délègue au domaine.
   */
  async retardCharge(ctx: HttpContext) {
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()
    const charge = await new SuiviService().retardCharge(refDate)
    return { reference_date: refDate.toISOString().slice(0, 10), charge }
  }

  /**
   * GET /suivi — coquille (shell) Inertia du suivi des commandes (issue #19).
   * Rendu INSTANTANÉ : aucun calcul X3 ici. Les lignes (calcul lourd) sont chargées
   * en différé côté client (fetch JSON) depuis `/api/v1/status/rows` → page réactive
   * Solid. Même motif que scheduler_controller.shortageTracker / shortageRows.
   */
  async board(ctx: HttpContext) {
    // Plus de referenceDate serveur : le calcul (statuts/verdicts) est TOUJOURS fait par
    // rapport à aujourd'hui réel (fenêtre de chargement fixe today-90j/+30j, cf loadRaw/
    // proactiveRows). La plage affichée est un filtre CLIENT pur sur les lignes déjà
    // chargées (cf tracking.tsx dateRange) — pas besoin de re-fetch au changement de plage.
    return ctx.inertia.render('scheduler/tracking', {
      rowsHref: '/api/v1/status/rows',
      proactiveRowsHref: '/api/v1/status/proactive-rows',
    })
  }

  /**
   * GET /api/v1/status/rows — endpoint JSON (calcul lourd différé).
   * Assigne statuts + causes + signal CQ pour toutes les lignes courantes via le
   * moteur domaine, puis formate en lignes d'affichage (statut court, icône, cause
   * + composants, action, allocation strict/CQ, date FR). Consommé en fetch par la
   * page Solid `scheduler/suivi`.
   */
  async rows(ctx: HttpContext) {
    // Toujours calculé par rapport à aujourd'hui réel — le filtrage par plage de dates
    // est un filtre CLIENT pur (cf tracking.tsx), pas un « aujourd'hui simulé ».
    const refDate = new Date()
    // ?refresh=1 → invalide le cache de contexte ET force le re-fetch X3 sous-jacent
    // (boardDataset.getLive, TTL 5 min séparé — sans `force`, reloadSuiviContext() seul
    // ne fait que vider le cache de contexte, la relecture retombe quand même sur les
    // données X3 encore en cache 5 min, servies stale par le SWR).
    const forceRefresh = !!ctx.request.input('refresh')
    if (forceRefresh) await reloadSuiviContext()

    let rows: SuiviDisplayRow[] = []
    let statusCounts: Record<SuiviStatus, number> = {
      A_EXPEDIER: 0,
      ALLOCATION_A_FAIRE: 0,
      RETARD_PROD: 0,
      RAS: 0,
    }
    let ateliers: AtelierOption[] = []
    let x3Error: string | null = null

    try {
      const [assignments, atelierByArticle] = await Promise.all([
        new SuiviService().assignFromLatest(refDate, forceRefresh),
        buildAtelierByArticle(),
      ])
      const built = buildSuiviDisplay(assignments, refDate, atelierByArticle)
      rows = built.rows
      statusCounts = built.statusCounts
      ateliers = distinctAteliers(rows)
    } catch (e) {
      // Log serveur complet (debug) ; on ne renvoie JAMAIS le message brut au client :
      // l'erreur X3 (SOAP via curl) contient les identifiants basic-auth (`-u user:pass`).
      logger.error({ err: e }, '[suivi] rows — échec chargement X3')
      x3Error = sanitizeX3Error((e as Error).message ?? String(e))
    }

    return {
      total: rows.length,
      statusCounts,
      cqCount: rows.filter((r) => r.cq).length,
      ateliers,
      rows,
      x3Error,
      referenceDate: refDate.toISOString().slice(0, 10),
    }
  }

  /**
   * GET /api/v1/status/proactive-rows — endpoint JSON de la vue PROACTIVE (réalisabilité).
   *
   * Repasse toutes les commandes ouvertes dans le moteur de faisabilité en mode SÉQUENTIEL :
   * consommation virtuelle de TOUS les composants (achat + sous-ensembles fabriqués) entre
   * OFs, sans override MFGMAT (preferEngineFeasibility) → reflète la contention réelle.
   * Verdict par commande : on_time / stock / retard / bloquee / sans_couverture. Même moteur
   * (loadOrderImpacts) que le board/ruptures, caches boardDataset partagés.
   */
  async proactiveRows(ctx: HttpContext) {
    // Toujours calculé par rapport à aujourd'hui réel — même logique que rows() (cf plus haut) :
    // le filtrage par plage de dates est un filtre CLIENT pur, la fenêtre de chargement reste fixe.
    const refDate = new Date()
    // Idem rows() : reloadSuiviContext() seul ne bust pas le cache boardDataset (TTL 5 min,
    // namespace séparé) — sans `force`, "Actualiser" peut rester bloqué sur des données stale
    // jusqu'à 5 min (SWR sert l'ancienne valeur pendant le refresh arrière-plan).
    const forceRefresh = !!ctx.request.input('refresh')
    if (forceRefresh) await reloadSuiviContext()

    let rows: ProactiveDisplayRow[] = []
    let verdictCounts: Record<ProactiveVerdictKey, number> = {
      time: 0,
      stock: 0,
      late: 0,
      blocked: 0,
      uncov: 0,
      risk: 0,
    }
    let ateliers: AtelierOption[] = []
    let x3Error: string | null = null

    try {
      const from = new Date(refDate)
      from.setDate(from.getDate() - RETARD_LOOKBACK_DAYS)
      const to = new Date(refDate)
      to.setDate(to.getDate() + SUIVI_FORWARD_DAYS)
      const [
        { result, articles, receptionFlows, nomenclatures, planInputs, fabricationHoursByOf },
        atelierByArticle,
      ] = await Promise.all([
        loadOrderImpacts({ from, to, mode: 'sequential', pipeline: 'proactive', force: forceRefresh }),
        buildAtelierByArticle(),
      ])
      // Réceptions à venir + retards de livraison (lookback RECEPTION_LOOKBACK_DAYS) — réutilise
      // les flows déjà fetchés par loadOrderImpacts via getLive (évite un SOAP PORDERQ dupliqué).
      const recFrom = new Date(refDate)
      recFrom.setDate(recFrom.getDate() - RECEPTION_LOOKBACK_DAYS)
      recFrom.setHours(0, 0, 0, 0)
      const receptionsByArticle = groupReceptionsByArticle(receptionFlows, recFrom)
      const built = buildProactiveDisplay(
        result,
        articles,
        receptionsByArticle,
        atelierByArticle,
        { nomenclatures, supplyFlows: planInputs.supplyFlows },
        fabricationHoursByOf
      )
      rows = built.rows
      verdictCounts = built.verdictCounts
      ateliers = distinctAteliers(rows)
    } catch (e) {
      logger.error({ err: e }, '[suivi] proactiveRows — échec chargement X3')
      x3Error = sanitizeX3Error((e as Error).message ?? String(e))
    }

    return {
      total: rows.length,
      verdictCounts,
      ateliers,
      rows,
      x3Error,
      referenceDate: refDate.toISOString().slice(0, 10),
    }
  }
}

function serializeAssignments(assignments: StatusAssignment[]) {
  return {
    total_rows: assignments.length,
    status_counts: buildStatusCounts(assignments.map((a) => a.status)),
    assignments: assignments.map((a) => ({
      numCommande: a.line.numCommande,
      article: a.line.article,
      status: a.status,
      besoinNet: a.besoinNet,
      qteAlloueeVirtuelle: a.qteAlloueeVirtuelle,
      utiliseStockSousCq: a.utiliseStockSousCq,
      alerteCqStatut: a.alerteCqStatut,
      attenteLignesMto: a.attenteLignesMto ?? false,
      cause: a.cause
        ? {
            type: a.cause.typeCause,
            composants: a.cause.composants,
            label: causeToDisplayString(a.cause),
          }
        : null,
      action: recommendActions(a),
    })),
  }
}

// ---------------------------------------------------------------------------
// Présentation — lignes d'affichage du registre suivi (issue #19).
// Mirroir côté client : inertia/lib/suivi/types.ts (SuiviDisplayRow).
// ---------------------------------------------------------------------------

export type SuiviStatusKey = 'exp' | 'alc' | 'ret' | 'ras'

/**
 * Projection d'un Emplacement pour l'affichage (colonne Emplacement du suivi).
 * Conserve la source (STOALL/STOCK) et la qté pour la pastille,
 * et précalcule enZoneExpe pour le rendu.
 */
export interface SuiviEmplacementDisplay {
  nom: string
  qte: number
  source: 'STOALL' | 'STOCK'
  enZoneExpe: boolean
  alreadyAllocated?: boolean
  /** PALNUM (identifiant palette), si renseigné par X3. */
  hum?: string | null
  /** Date d'entrée en stock (STOCK.LASRCPDAT_0) — JJ/MM/AAAA, null si inconnue. */
  dateMiseEnStock?: string | null
}

export interface SuiviCauseDisplay {
  type: CauseType
  label: string
  comps: { art: string; qty: number }[]
  /** ETA du composant goulot (date JJ/MM + n° d'achat) pour RUPTURE_COMPOSANTS — null sinon. */
  reception: { eta: string; po: string; supplier: string } | null
  /** Analyse rétro (RETARD_COMPOSANT_TARDIF) : affermissement OF + composant disponible tard. */
  retro: {
    ofPegue: string
    affermissement: string
    composant: { art: string; dispoA: string; cq: boolean } | null
  } | null
}

export interface SuiviDisplayRow {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  /** Référence commande client (SORDER.CUSORDREF_0) — null si absente. */
  refCommandeClient?: string | null
  /** Référence article client (ITMBPC.ITMREFBPC_0) — null si absente / identique à l'article. */
  refArticleClient?: string | null
  statusKey: SuiviStatusKey
  statusLabel: string
  statusIcon: string
  qteRestante: number
  besoinNet: number
  allocStrict: number
  allocCq: number
  cq: boolean
  /** Ligne A_EXPEDIER d'une commande MTO incomplète (expédition partielle bloquée). */
  attenteLignes: boolean
  dateExp: string
  /** ISO YYYY-MM-DD pour le tri chronologique (null si absente). */
  dateExpIso: string | null
  late: boolean
  /** Jours ouvrés de retard (0 si pas en retard). Exclut week-ends + fériés FR. */
  lateDays: number
  /** Gravité du retard : 'tolerance' (≤ 1 j ouvré) | 'critical' (au-delà) | null. */
  lateSeverity: 'tolerance' | 'critical' | null
  /** Emplacements (LOC) rattachés à la ligne (STOALL si allouée, sinon STOCK). */
  emplacements: SuiviEmplacementDisplay[]
  /** True si au moins un emplacement est en zone d'expédition (QUAI|SM|EXP|S9C|S3C). */
  enZoneExpe: boolean
  cause: SuiviCauseDisplay | null
  action: { severity: 'info' | 'warning' | 'critical'; label: string }
  /** Atelier (STOLOC du poste de gamme) de l'article — '' si inconnu (issue #36). */
  atelier: string
  atelierLabel: string
  /** Champ texte pré-concaténé pour le filtre client (lowercase). */
  filter: string
}

// ---------------------------------------------------------------------------
// Vue proactive (réalisabilité des commandes via le moteur séquentiel)
// ---------------------------------------------------------------------------

/** Clé courte du verdict moteur pour le badge de la vue proactive. */
export type ProactiveVerdictKey = 'time' | 'stock' | 'late' | 'blocked' | 'uncov' | 'risk'

export interface ProactiveOf {
  numOf: string
  article: string
  qteAllouee: number
  dateFin: string
  feasible: boolean | null
  statutNum: number
  missingComponents: { art: string; qty: number }[]
  /** Vrai si l'OF a des pointages d'opérations intermédiaires (issue #41). */
  estDebuté?: boolean
  /** Charge réelle gamme (Σ qteRestante/cadence, heures brutes) — null si gamme inconnue. */
  chargeHeures: number | null
  /** État d'avancement : pièces déjà réalisées / total de l'OF — null si non débuté/inconnu. */
  piecesFaites: number | null
  piecesTotalOf: number | null
}

export interface ProactiveDisplayRow {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  /** Référence commande client (SORDER.CUSORDREF_0) — null si absente. */
  refCommandeClient?: string | null
  /** Référence article client (ITMBPC.ITMREFBPC_0) — null si absente / identique à l'article. */
  refArticleClient?: string | null
  qteRestante: number
  qteAllouee: number
  reliquat: number
  dateExp: string
  dateExpIso: string | null
  verdictKey: ProactiveVerdictKey
  verdictLabel: string
  /** Gravité du retard : 'tolerance' (≤ 1 j ouvré) | 'critical' (au-delà) | null. */
  lateSeverity: 'tolerance' | 'critical' | null
  /** Mode de couverture : « Stock » | n° OF (« · »-séparés) | « Achat » | « — ». */
  couverture: string
  joursRetard: number
  /**
   * Composants goulots agrégés sur les OFs de la commande (art + désignation + qté manquante).
   * `reception` = première réception d'achat couvrant la qté manquante (ETA + n° commande
   * d'achat) — la lentille appro de la table Ruptures, rapatriée au niveau commande pour
   * rendre la vue proactive auto-suffisante. `null` si aucune couverture prévue.
   */
  composants: {
    art: string
    desc: string
    qty: number
    reception: { eta: string; po: string; supplier: string } | null
    /**
     * Descente BOM du composant quand c'est un SOUS-ENSEMBLE fabriqué (lentille
     * d'EXPLICATION, mode photo stock strict — le verdict de la ligne reste au SE) :
     * - 'se_a_lancer' : composants internes dispo → il suffit de lancer l'OF du SE ;
     * - 'bloque' : composants internes réellement manquants (feuilles achetées),
     *   chacun avec sa réception couvrante. `null` : composant acheté (pas de BOM).
     */
    descente: {
      statut: 'se_a_lancer' | 'bloque'
      par: {
        art: string
        desc: string
        manque: number
        reception: {
          eta: string
          po: string
          supplier: string
          overdue: boolean
          retardJ: number
        } | null
      }[]
    } | null
  }[]
  ofs: ProactiveOf[]
  /** Atelier (STOLOC du poste de gamme) de l'article — '' si inconnu (issue #36). */
  atelier: string
  atelierLabel: string
  filter: string
}

/** Statut métier → facettes d'affichage du badge (clé courte, libellé, icône). */
const STATUS_DISPLAY: Record<SuiviStatus, { key: SuiviStatusKey; short: string; icon: string }> = {
  A_EXPEDIER: { key: 'exp', short: 'À expédier', icon: 'outbound' },
  ALLOCATION_A_FAIRE: { key: 'alc', short: 'À allouer', icon: 'inventory_2' },
  RETARD_PROD: { key: 'ret', short: 'Retard', icon: 'report' },
  RAS: { key: 'ras', short: 'RAS', icon: 'check_circle' },
}
const CAUSE_LABEL: Record<CauseType, string> = {
  STOCK_DISPONIBLE_NON_ALLOUE: 'Stock disponible — non alloué',
  ATTENTE_RECEPTION_FOURNISSEUR: 'Attente réception fournisseur',
  AUCUN_OF_PLANIFIE: 'Aucun OF planifié',
  RUPTURE_COMPOSANTS: 'Rupture composants',
  RETARD_ORDONNANCEMENT: 'OF planifié en retard',
  RETARD_COMPOSANT_TARDIF: 'Composant disponible tardivement',
  INCONNUE: 'Cause indéterminée',
}

/** Formate une date ISO (YYYY-MM-DD) en JJ/MM — '' si absente. */
function fmtFrDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}` : iso
}

/** Formate une date ISO (YYYY-MM-DD) en JJ/MM/AAAA — null si absente. */
function fmtFrFull(iso: string | null | undefined): string | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * Sanitize une erreur X3 pour la bannière client.
 *
 * L'erreur X3 (SOAP via curl) embarque les identifiants basic-auth (`-u user:pass`)
 * voire des creds en URL — on ne renvoie JAMAIS le message brut au navigateur.
 * Les erreurs de connexion (réseau/timeout/SOAP) → message court générique ;
 * sinon on masque les creds et on tronque. Le détail complet est loggué serveur.
 */
function sanitizeX3Error(msg: string): string {
  const isConn =
    /X3 query failed|curl:|Command failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|max-time|SOAP|XML/i.test(
      msg
    )
  if (isConn) return 'X3 injoignable — la connexion au serveur X3 a échoué.'
  return msg
    .replace(/-u\s+\S+/g, '-u ***')
    .replace(/:\/\/[^\s/@]+@[^\s/]+/g, '://***@')
    .slice(0, 240)
}

/**
 * Projette les StatusAssignment du domaine en lignes d'affichage prêtes au rendu
 * (statut court + icône, cause + composants triés, action + severity, allocation
 * strict/CQ, date FR, champ `filter` pré-concaténé pour la recherche client).
 */
export function buildSuiviDisplay(
  assignments: StatusAssignment[],
  refDate?: Date,
  atelierByArticle: Map<string, AtelierOption> = new Map()
): {
  rows: SuiviDisplayRow[]
  statusCounts: Record<SuiviStatus, number>
} {
  const now = refDate ?? new Date()
  const nowIso = now.toISOString().slice(0, 10)
  const rows: SuiviDisplayRow[] = assignments.map((a) => {
    const cause: SuiviCauseDisplay | null = a.cause
      ? {
          type: a.cause.typeCause,
          // Retard d'ordonnancement : libellé enrichi du nombre de jours (« — N j »).
          label:
            a.cause.typeCause === 'RETARD_ORDONNANCEMENT' && a.cause.joursRetard
              ? `${CAUSE_LABEL[a.cause.typeCause]} — ${a.cause.joursRetard} j`
              : CAUSE_LABEL[a.cause.typeCause],
          comps: Object.entries(a.cause.composants)
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([art, qty]) => ({ art, qty: Math.round(qty * 1000) / 1000 })),
          reception: a.cause.reception
            ? {
                eta: fmtFrDay(a.cause.reception.eta),
                po: a.cause.reception.po,
                supplier: a.cause.reception.supplier,
              }
            : null,
          retro: a.cause.retro
            ? {
                ofPegue: a.cause.retro.ofPegue,
                affermissement: fmtFrDay(a.cause.retro.dateAffermissement),
                composant: a.cause.retro.composantTardif
                  ? {
                      art: a.cause.retro.composantTardif.art,
                      dispoA: fmtFrDay(a.cause.retro.composantTardif.dispoA),
                      cq: a.cause.retro.composantTardif.viaControleQualite,
                    }
                  : null,
              }
            : null,
        }
      : a.status === 'RETARD_PROD'
        ? {
            type: 'INCONNUE',
            label: CAUSE_LABEL['INCONNUE'],
            comps: [],
            reception: null,
            retro: null,
          }
        : null
    const rec = recommendActions(a)
    const compsTxt = cause ? cause.comps.map((c) => `${c.art} −${c.qty}`).join(' ') : ''
    const atelier = atelierByArticle.get(a.line.article) ?? { code: '', label: '' }
    const attente = !!a.attenteLignesMto
    return {
      numCommande: a.line.numCommande,
      client: a.line.nomClient,
      article: a.line.article,
      designation: a.line.designation,
      type: a.line.typeCommande,
      refCommandeClient: a.line.refCommandeClient ?? null,
      refArticleClient: a.line.refArticleClient ?? null,
      statusKey: STATUS_DISPLAY[a.status].key,
      statusLabel: STATUS_DISPLAY[a.status].short,
      statusIcon: STATUS_DISPLAY[a.status].icon,
      qteRestante: Math.round(a.line.qteRestante),
      qteCommandee: Math.round(a.line.qteCommandee),
      besoinNet: Math.max(0, Math.round(a.besoinNet)),
      allocStrict: Math.round(a.qteAlloueeVirtuelleStricte),
      allocCq: Math.round(a.qteAlloueeVirtuelleCq),
      cq: !!a.alerteCqStatut,
      attenteLignes: attente,
      dateExp: fmtFrDay(a.line.dateExpedition?.toISOString().slice(0, 10)),
      dateExpIso: a.line.dateExpedition?.toISOString().slice(0, 10) ?? null,
      late: a.line.dateExpedition !== null && a.line.dateExpedition < now,
      lateDays:
        a.line.dateExpedition !== null && a.line.dateExpedition < now
          ? workingDaysBetween(a.line.dateExpedition.toISOString().slice(0, 10), nowIso)
          : 0,
      lateSeverity:
        a.line.dateExpedition !== null && a.line.dateExpedition < now
          ? lateSeverity(
              workingDaysBetween(a.line.dateExpedition.toISOString().slice(0, 10), nowIso)
            )
          : null,
      emplacements: (a.line.emplacements ?? [])
        .filter((e) => Boolean(e.nom))
        .map((e) => ({
          nom: e.nom,
          qte: e.qtePalette ?? 0,
          source: e.source,
          enZoneExpe: ZONE_EXPEDITION_PATTERN.test(e.nom),
          alreadyAllocated: e.alreadyAllocated ?? false,
          hum: e.hum || null,
          dateMiseEnStock: fmtFrFull(e.dateMiseEnStock ? e.dateMiseEnStock.toISOString().slice(0, 10) : null),
        })),
      enZoneExpe: enZoneExpedition(a.line),
      cause,
      action: { severity: rec.severity, label: rec.actions[0] ?? '—' },
      atelier: atelier.code,
      atelierLabel: atelier.label,
      filter:
        `${a.line.numCommande} ${a.line.nomClient} ${a.line.article} ${a.line.designation} ${a.line.typeCommande} ${a.line.refCommandeClient ?? ''} ${a.line.refArticleClient ?? ''} ${cause?.label ?? ''} ${compsTxt} ${(a.line.emplacements ?? []).map((e) => e.nom).join(' ')} ${atelier.label}${attente ? ' attente lignes mto' : ''}`.toLowerCase(),
    }
  })
  return { rows, statusCounts: buildStatusCounts(assignments.map((a) => a.status)) }
}

const VERDICT_DISPLAY: Record<
  OrderImpactResult['orders'][number]['statut'],
  { key: ProactiveVerdictKey; label: string }
> = {
  on_time: { key: 'time', label: 'À temps' },
  stock: { key: 'stock', label: 'En stock' },
  retard: { key: 'late', label: 'En retard' },
  bloquee: { key: 'blocked', label: 'Bloquée' },
  sans_couverture: { key: 'uncov', label: 'Sans couverture' },
}

/**
 * Projette le verdict du moteur séquentiel (OrderImpactResult) en lignes d'affichage
 * pour la vue proactive : verdict court + jours de retard + composants goulots agrégés +
 * OFs rattachés. Seules les vraies commandes (engagements clients) sont conservées.
 */
export function buildProactiveDisplay(
  result: OrderImpactResult,
  articles: Map<string, Article> = new Map(),
  receptionsByArticle: Map<string, ReceptionRecord[]> = new Map(),
  atelierByArticle: Map<string, AtelierOption> = new Map(),
  /**
   * Contexte BOM pour la descente d'explication des SE manquants (photo stock strict).
   * Optionnel : absent (tests/legacy) → pas de descente, `descente: null` partout.
   */
  bomContext?: { nomenclatures: Map<string, Nomenclature>; supplyFlows: Flow[] },
  /** Charge réelle gamme par OF (heures brutes) — cf order_impacts_loader.ts. */
  fabricationHoursByOf: Map<string, number> = new Map()
): {
  rows: ProactiveDisplayRow[]
  verdictCounts: Record<ProactiveVerdictKey, number>
} {
  // Horizon d'affichage : borné à la fenêtre de chargement (today + SUIVI_FORWARD_DAYS) — au-delà,
  // pas de données de toute façon. Le filtrage fin (plage choisie + rétention des retards) est un
  // filtre CLIENT (cf tracking.tsx) : au-delà de cette borne, souvent du « sans couverture » bruité
  // (OF couvrant hors tolérance de date), donc pas utile de le charger plus loin.
  const horizonIso = new Date()
  horizonIso.setHours(0, 0, 0, 0)
  horizonIso.setDate(horizonIso.getDate() + SUIVI_FORWARD_DAYS)
  const todayIso = isoLocalDay()

  let ruptureDataset: RuptureDataset | undefined
  if (bomContext) {
    const stockNet = new Map<string, number>()
    for (const f of bomContext.supplyFlows) {
      if (f.date !== null) continue
      const delta = f.direction === 'supply' ? f.quantity : -f.quantity
      stockNet.set(f.article, (stockNet.get(f.article) ?? 0) + delta)
    }

    const engineOfs: RuptureOfInput[] = bomContext.supplyFlows
      .filter((f) => f.direction === 'supply' && f.origin.type === 'of' && f.quantity > 0)
      .map((f) => {
        const id = (f.origin as any).id ?? ''
        return {
          numOf: id,
          article: f.article,
          qteRestante: f.quantity,
          statutNum: (f.origin as any).status ?? 3,
          dateBesoin: f.date ? new Date(f.date) : null,
        }
      })

    ruptureDataset = {
      articles,
      nomenclatures: bomContext.nomenclatures,
      stockNet,
      ofSupply: buildOfSupply(engineOfs),
    }
  }

  const rows: ProactiveDisplayRow[] = result.orders
    .filter((o) => o.nature === 'commande')
    .filter((o) => !o.dateExpedition || o.dateExpedition <= horizonIso.toISOString().slice(0, 10))
    .map((o) => {
      const composants = new Map<string, number>()
      for (const of of o.ofs) {
        for (const [art, qty] of Object.entries(of.missingComponents)) {
          if (qty > 0) composants.set(art, (composants.get(art) ?? 0) + qty)
        }
      }
      // Lentille réception partagée composant/descente : 1ère réception d'achat dont le
      // cumul atteint la qté manquante → ETA + n° commande d'achat. Overdue = attendue
      // dans le passé (retard de livraison) → lateness = today − attendue.
      const coveringReception = (art: string, qty: number) => {
        const rec = resolveCoveringReception(receptionsByArticle.get(art) ?? [], qty, {
          overdueMinQty: RECEPTION_OVERDUE_MIN_QTY,
          todayIso,
        })
        if (!rec) return null
        const overdue = rec.dateArrivee < todayIso
        return {
          eta: fmtFrDay(rec.dateArrivee),
          po: rec.id,
          supplier: rec.supplier,
          overdue,
          retardJ: overdue ? daysBetweenIso(rec.dateArrivee, todayIso) : 0,
        }
      }

      const comps = [...composants.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([art, qty]) => {
          const qtyR = Math.round(qty * 100) / 100

          // Descente d'EXPLICATION pour les SE fabriqués manquants : le verdict de la
          // ligne reste porté par le SE (contention séquentielle) ; ici on répond à
          // « si je lance l'OF du SE maintenant, passe-t-il ? » en PHOTO (stock strict
          // net, règles AFANT/OF-couvrant du moteur partagé). blockingComponents vide
          // → SE à lancer ; sinon → les vraies feuilles bloquantes + leur réception.
          let descente: ProactiveDisplayRow['composants'][number]['descente'] = null
          const info = articles.get(art)
          if (
            bomContext &&
            ruptureDataset &&
            bomContext.nomenclatures.has(art) &&
            (!info || !isSubcontracted(info))
          ) {
            const virtualOf: RuptureOfInput = {
              numOf: '__descente__',
              article: art,
              qteRestante: qtyR,
              statutNum: 2, // Non-ferme pour propager la faisabilité réelle
              dateBesoin: null,
            }
            const verdicts = evaluateRuptures([virtualOf], ruptureDataset, 'photo')
            const v = verdicts.get('__descente__')!
            descente = v.feasible
              ? { statut: 'se_a_lancer', par: [] }
              : {
                  statut: 'bloque',
                  par: v.missingDetail
                    .filter((bc) => !bc.fabricated)
                    .map((bc) => ({
                      art: bc.article,
                      desc: articles.get(bc.article)?.description ?? '',
                      manque: Math.round(bc.shortage * 100) / 100,
                      reception: coveringReception(bc.article, Math.round(bc.shortage * 100) / 100),
                    })),
                }
          }

          return {
            art,
            desc: articles.get(art)?.description ?? '',
            qty: qtyR,
            reception: coveringReception(art, qtyR),
            descente,
          }
        })

      // La demande est déjà nettoyée de l'allocation ERP côté loader (proactif) : qteRestante
      // = reste à RÉALISER (reste à livrer − alloué). Le verdict moteur porte donc sur la part
      // réellement à produire/couvrir.
      const verdict = VERDICT_DISPLAY[o.statut]

      // Issue #41 : une commande "À temps" dont au moins un OF couvrant est ferme
      // mais NON débuté (pas de pointage opérations intermédiaires) ET dont la date
      // de fin est dans ≤ 2 jours (buffer logistique) → "À risque".
      // Utilise todayIso (référence déterministe) plutôt que Date.now().
      const todayMs = Date.parse(`${todayIso}T00:00:00Z`)
      const J2_MS = 2 * 86_400_000
      const isAtRisk =
        verdict.key === 'time' &&
        o.ofs.some((of) => {
          if (of.estDebuté) return false
          if (of.statutNum !== 1 && of.statutNum !== 2) return false // seulement OF affermis/planifiés
          if (!of.dateFin) return false
          const fin = new Date(of.dateFin).getTime()
          if (Number.isNaN(fin)) return false
          return fin - todayMs <= J2_MS
        })
      const finalVerdictKey: ProactiveVerdictKey = isAtRisk ? 'risk' : verdict.key
      const finalVerdictLabel = isAtRisk ? 'À risque' : verdict.label

      const ofsFinal = o.ofs.map((of) => ({
        numOf: of.numOf,
        article: of.article,
        qteAllouee: Math.round(of.qteAllouee),
        dateFin: fmtFrDay(of.dateFin),
        feasible: of.feasible,
        statutNum: of.statutNum,
        missingComponents: Object.entries(of.missingComponents)
          .filter(([, q]) => q > 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([art, qty]) => ({ art, qty: Math.round(qty * 100) / 100 })),
        estDebuté: of.estDebuté,
        chargeHeures: fabricationHoursByOf.get(of.numOf) ?? null,
        // piecesTotalOf = EXTQTY (lancée d'origine, stable) depuis order-impacts.ts — garde-fou
        // seulement (repli sans `launched` disponible ramènerait à RMNEXTQTY, potentiellement
        // dépassé par le cumul CPLQTY d'un OF déjà partiellement déclaré, cf commit précédent).
        piecesFaites:
          of.piecesFaites != null && of.piecesTotalOf != null
            ? Math.min(of.piecesFaites, of.piecesTotalOf)
            : (of.piecesFaites ?? null),
        piecesTotalOf: of.piecesTotalOf ?? null,
      }))
      const compsTxt = comps.map((c) => `${c.art} -${c.qty}`).join(' ')
      // Mode de couverture : Stock (stock_complete) | OF contremarque/cumulatif (n° OF) |
      // Achat (purchase_supply) | — (none). Affiche QUEL OF couvre la commande.
      const ofsNum = ofsFinal.map((f) => f.numOf)
      const couverture =
        o.matchingMethod === 'stock_complete'
          ? 'Stock'
          : ofsNum.length > 0
            ? ofsNum.join(' · ')
            : o.matchingMethod === 'purchase_supply'
              ? 'Achat'
              : '—'
      const atelier = atelierByArticle.get(o.article) ?? { code: '', label: '' }
      return {
        numCommande: o.numCommande,
        client: o.client,
        article: o.article,
        designation: o.description,
        type: o.typeCommande,
        refCommandeClient: o.refCommandeClient ?? null,
        refArticleClient: o.refArticleClient ?? null,
        qteRestante: Math.round(o.qteRestante),
        qteAllouee: Math.round(o.qteAllouee ?? 0),
        reliquat: Math.round(o.reliquat),
        dateExp: fmtFrDay(o.dateExpedition),
        dateExpIso: o.dateExpedition || null,
        verdictKey: finalVerdictKey,
        verdictLabel: finalVerdictLabel,
        lateSeverity:
          finalVerdictKey === 'late' && o.dateExpedition
            ? lateSeverity(workingDaysBetween(o.dateExpedition, todayIso))
            : null,
        couverture,
        joursRetard: o.joursRetard,
        composants: comps,
        ofs: ofsFinal,
        atelier: atelier.code,
        atelierLabel: atelier.label,
        filter:
          `${o.numCommande} ${o.client} ${o.article} ${o.description} ${o.typeCommande} ${o.refCommandeClient ?? ''} ${o.refArticleClient ?? ''} ${finalVerdictLabel} ${couverture} ${compsTxt} ${atelier.label}`.toLowerCase(),
      }
    })

  const verdictCounts: Record<ProactiveVerdictKey, number> = {
    time: 0,
    stock: 0,
    late: 0,
    blocked: 0,
    uncov: 0,
    risk: 0,
  }
  for (const r of rows) verdictCounts[r.verdictKey]++

  return { rows, verdictCounts }
}
