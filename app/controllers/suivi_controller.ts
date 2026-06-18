import { HttpContext } from '@adonisjs/core/http'
import {
  assignStatuses,
  recommendActions,
  buildStatusCounts,
  causeToDisplayString,
  type OrderLine,
  type StockBreakdown,
  type StatusAssignment,
} from '#app/domain/suivi'
import { SuiviService } from '#services/suivi_service'
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

    const details = orderLines.map((demand) => {
      const origin = demand.origin as Extract<Flow['origin'], { type: 'order' }>
      const supplyFlows = [...stockFlows, ...receptionFlows, ...ofFlows].filter(
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
