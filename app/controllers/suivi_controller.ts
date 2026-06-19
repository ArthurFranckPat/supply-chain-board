import { HttpContext } from '@adonisjs/core/http'
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
import { SuiviService, reloadSuiviContext } from '#services/suivi_service'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import type { OrderImpactResult } from '#app/domain/order-impacts'
import { X3OfRepository } from '#repositories/of_repository'
import { X3StockRepository } from '#repositories/stock_repository'
import { X3ReceptionRepository } from '#repositories/reception_repository'
import { X3BesoinClientRepository } from '#repositories/besoin_client_repository'
import type { Flow } from '#app/domain/models/flow'

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
    const { lines: rawLines, stock: stockRaw, referenceDate } = request.only([
      'lines',
      'stock',
      'referenceDate',
    ])

    const lines = ((rawLines ?? []) as any[]).map((l: any) => ({
      ...l,
      dateExpedition: l.dateExpedition ? new Date(l.dateExpedition) : null,
      dateLivPrevu: l.dateLivPrevu ? new Date(l.dateLivPrevu) : null,
      emplacements: l.emplacements ?? [],
    })) as OrderLine[]

    const stock = new Map<string, StockBreakdown>(
      Object.entries(stockRaw ?? {}).map(([article, bd]) => [article, bd as StockBreakdown]),
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
   * GET /api/v1/status/status/:order
   * Détail commande + flux d'approvisionnement correspondants depuis X3.
   */
  async statusDetail(ctx: HttpContext) {
    const demandFlows = await new X3BesoinClientRepository().getDemandFlows()

    const orderLines = demandFlows.filter(
      (f) => f.origin.type === 'order' && (f.origin as any).id === ctx.params.order,
    )

    if (orderLines.length === 0) {
      return ctx.response.notFound({ message: `Commande ${ctx.params.order} non trouvee` })
    }

    const stockFlows = await new X3StockRepository().getStockFlows()
    const receptionFlows = await new X3ReceptionRepository().getReceptionFlows()
    const ofFlows = await new X3OfRepository().getSupplyFlows()

    const allSupplyFlows = [...stockFlows, ...receptionFlows, ...ofFlows]
    const details = orderLines.map((demand) => {
      const origin = demand.origin as Extract<Flow['origin'], { type: 'order' }>
      const supplyFlows = allSupplyFlows.filter(
        (s) => s.article === demand.article && s.direction === 'supply',
      )

      return {
        article: demand.article,
        quantity: demand.quantity,
        dateExpedition: demand.date?.toISOString().slice(0, 10) ?? null,
        customer: origin.customer,
        orderType: origin.orderType,
        supply: supplyFlows.map((s) => ({
          type: s.origin.type,
          quantity: s.quantity,
          date: s.date?.toISOString().slice(0, 10) ?? null,
          id: (s.origin as any).id ?? '',
        })),
      }
    })

    return { no_commande: ctx.params.order, lines: details }
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
    const referenceDate =
      (ctx.request.input('referenceDate') as string | undefined) || new Date().toISOString().slice(0, 10)
    return ctx.inertia.render('scheduler/suivi', {
      referenceDate,
      rowsHref: `/api/v1/status/rows?referenceDate=${encodeURIComponent(referenceDate)}`,
      proactiveRowsHref: `/api/v1/status/proactive-rows?referenceDate=${encodeURIComponent(referenceDate)}`,
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
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()
    // ?refresh=1 → invalide le cache de contexte (force un re-fetch X3 live).
    if (ctx.request.input('refresh')) await reloadSuiviContext()

    let rows: SuiviDisplayRow[] = []
    let statusCounts: Record<SuiviStatus, number> = {
      A_EXPEDIER: 0,
      ALLOCATION_A_FAIRE: 0,
      RETARD_PROD: 0,
      RAS: 0,
    }
    let x3Error: string | null = null

    try {
      const assignments = await new SuiviService().assignFromLatest(refDate)
      const built = buildSuiviDisplay(assignments, refDate)
      rows = built.rows
      statusCounts = built.statusCounts
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
    const referenceDate = ctx.request.input('referenceDate')
    const refDate = referenceDate ? new Date(referenceDate) : new Date()
    if (ctx.request.input('refresh')) await reloadSuiviContext()

    let rows: ProactiveDisplayRow[] = []
    let verdictCounts: Record<ProactiveVerdictKey, number> = { time: 0, stock: 0, late: 0, blocked: 0, uncov: 0 }
    let x3Error: string | null = null

    try {
      const from = new Date(refDate)
      from.setDate(from.getDate() - 365)
      const to = new Date(refDate)
      to.setDate(to.getDate() + 90)
      const { result } = await loadOrderImpacts({ from, to, mode: 'sequential', preferEngineFeasibility: true })
      const built = buildProactiveDisplay(result)
      rows = built.rows
      verdictCounts = built.verdictCounts
    } catch (e) {
      logger.error({ err: e }, '[suivi] proactiveRows — échec chargement X3')
      x3Error = sanitizeX3Error((e as Error).message ?? String(e))
    }

    return {
      total: rows.length,
      verdictCounts,
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
      cause: a.cause
        ? { type: a.cause.typeCause, composants: a.cause.composants, label: causeToDisplayString(a.cause) }
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
  statusKey: SuiviStatusKey
  statusLabel: string
  statusIcon: string
  qteRestante: number
  besoinNet: number
  allocStrict: number
  allocCq: number
  cq: boolean
  dateExp: string
  /** ISO YYYY-MM-DD pour le tri chronologique (null si absente). */
  dateExpIso: string | null
  late: boolean
  /** Emplacements (LOC) rattachés à la ligne (STOALL si allouée, sinon STOCK). */
  emplacements: SuiviEmplacementDisplay[]
  /** True si au moins un emplacement est en zone d'expédition (QUAI|SM|EXP|S9C|S3C). */
  enZoneExpe: boolean
  cause: SuiviCauseDisplay | null
  action: { severity: 'info' | 'warning' | 'critical'; label: string }
  /** Champ texte pré-concaténé pour le filtre client (lowercase). */
  filter: string
}

// ---------------------------------------------------------------------------
// Vue proactive (réalisabilité des commandes via le moteur séquentiel)
// ---------------------------------------------------------------------------

/** Clé courte du verdict moteur pour le badge de la vue proactive. */
export type ProactiveVerdictKey = 'time' | 'stock' | 'late' | 'blocked' | 'uncov'

export interface ProactiveOf {
  numOf: string
  article: string
  qteAllouee: number
  dateFin: string
  feasible: boolean | null
  statutNum: number
  missingComponents: { art: string; qty: number }[]
}

export interface ProactiveDisplayRow {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  qteRestante: number
  reliquat: number
  dateExp: string
  dateExpIso: string | null
  verdictKey: ProactiveVerdictKey
  verdictLabel: string
  joursRetard: number
  /** Composants goulots agrégés sur les OFs de la commande (art + qté manquante). */
  composants: { art: string; qty: number }[]
  ofs: ProactiveOf[]
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
      msg,
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
export function buildSuiviDisplay(assignments: StatusAssignment[], refDate?: Date): {
  rows: SuiviDisplayRow[]
  statusCounts: Record<SuiviStatus, number>
} {
  const now = refDate ?? new Date()
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
      : null
    const rec = recommendActions(a)
    const compsTxt = cause ? cause.comps.map((c) => `${c.art} −${c.qty}`).join(' ') : ''
    return {
      numCommande: a.line.numCommande,
      client: a.line.nomClient,
      article: a.line.article,
      designation: a.line.designation,
      type: a.line.typeCommande,
      statusKey: STATUS_DISPLAY[a.status].key,
      statusLabel: STATUS_DISPLAY[a.status].short,
      statusIcon: STATUS_DISPLAY[a.status].icon,
      qteRestante: Math.round(a.line.qteRestante),
      besoinNet: Math.max(0, Math.round(a.besoinNet)),
      allocStrict: Math.round(a.qteAlloueeVirtuelleStricte),
      allocCq: Math.round(a.qteAlloueeVirtuelleCq),
      cq: !!a.alerteCqStatut,
      dateExp: fmtFrDay(a.line.dateExpedition?.toISOString().slice(0, 10)),
      dateExpIso: a.line.dateExpedition?.toISOString().slice(0, 10) ?? null,
      late: a.line.dateExpedition !== null && a.line.dateExpedition < now,
      emplacements: (a.line.emplacements ?? [])
        .filter((e) => Boolean(e.nom))
        .map((e) => ({
          nom: e.nom,
          qte: e.qtePalette ?? 0,
          source: e.source,
          enZoneExpe: ZONE_EXPEDITION_PATTERN.test(e.nom),
          alreadyAllocated: e.alreadyAllocated ?? false,
          hum: e.hum || null,
        })),
      enZoneExpe: enZoneExpedition(a.line),
      cause,
      action: { severity: rec.severity, label: rec.actions[0] ?? '—' },
      filter: `${a.line.numCommande} ${a.line.nomClient} ${a.line.article} ${a.line.designation} ${a.line.typeCommande} ${cause?.label ?? ''} ${compsTxt} ${(a.line.emplacements ?? []).map((e) => e.nom).join(' ')}`.toLowerCase(),
    }
  })
  return { rows, statusCounts: buildStatusCounts(assignments.map((a) => a.status)) }
}

const VERDICT_DISPLAY: Record<OrderImpactResult['orders'][number]['statut'], { key: ProactiveVerdictKey; label: string }> = {
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
export function buildProactiveDisplay(result: OrderImpactResult): {
  rows: ProactiveDisplayRow[]
  verdictCounts: Record<ProactiveVerdictKey, number>
} {
  const rows: ProactiveDisplayRow[] = result.orders
    .filter((o) => o.nature === 'commande')
    .map((o) => {
      const composants = new Map<string, number>()
      for (const of of o.ofs) {
        for (const [art, qty] of Object.entries(of.missingComponents)) {
          if (qty > 0) composants.set(art, (composants.get(art) ?? 0) + qty)
        }
      }
      const comps = [...composants.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([art, qty]) => ({ art, qty: Math.round(qty * 100) / 100 }))
      const verdict = VERDICT_DISPLAY[o.statut]
      const compsTxt = comps.map((c) => `${c.art} -${c.qty}`).join(' ')
      return {
        numCommande: o.numCommande,
        client: o.client,
        article: o.article,
        designation: o.description,
        type: o.typeCommande,
        qteRestante: Math.round(o.qteRestante),
        reliquat: Math.round(o.reliquat),
        dateExp: fmtFrDay(o.dateExpedition),
        dateExpIso: o.dateExpedition || null,
        verdictKey: verdict.key,
        verdictLabel: verdict.label,
        joursRetard: o.joursRetard,
        composants: comps,
        ofs: o.ofs.map((of) => ({
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
        })),
        filter: `${o.numCommande} ${o.client} ${o.article} ${o.description} ${o.typeCommande} ${verdict.label} ${compsTxt}`.toLowerCase(),
      }
    })

  const verdictCounts: Record<ProactiveVerdictKey, number> = { time: 0, stock: 0, late: 0, blocked: 0, uncov: 0 }
  for (const r of rows) verdictCounts[r.verdictKey]++

  return { rows, verdictCounts }
}
