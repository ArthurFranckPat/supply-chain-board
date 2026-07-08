/**
 * Détail d'une ligne de commande (panneau au clic dans la vue planification) : infos
 * commande/ligne + poste/charge + override + faisabilité BOM direct (composants × qté,
 * stock strict/qc + réceptions arrivées).
 *
 * Extrait de `OrderPlanningController.lineDetail` (issue #49) : 81 l. d'assemblage
 * inline (poste/charge, override, BOM+faisabilité, formatage FR).
 */

import boardDataset from '#services/board_dataset'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import { hoursForQuantity } from '#app/domain/models/gamme'

const nFr = (n: number) => Math.round(n * 100) / 100
const fmtFr = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })

/** Retourne `null` si la ligne de commande est introuvable (404 côté controller). */
export async function loadOrderLineDetail(num: string, ligne: string) {
  const line = await new X3OrderLineRepository().getOrderLine(num, ligne)
  if (!line) return null

  // Poste + charge (gamme figée par article).
  const ref = await boardDataset.getReferential()
  const op = ref.gamme.find((g) => g.article === line.article)
  const workstation = op?.workstation ?? null
  const workstationLabel = op?.workstationLabel || workstation
  const hours = op ? hoursForQuantity(op, line.quantite) : 0

  // Override local (date X3 surchargée).
  const overrideMap = await new OrderLineOverrideStore().getMap()
  const overrideKey = `${line.numCommande}#${line.ligne}`
  const overrideDate = overrideMap.get(overrideKey) ?? null

  // BOM direct + faisabilité (composants × qté ligne, stock + réceptions arrivées).
  const nomEntries = await boardDataset.getNomenclature().catch(() => [])
  const components = nomEntries.filter((e) => e.parentArticle === line.article)
  const compArticles = [...new Set(components.map((c) => c.componentArticle))]
  const stockFlows = compArticles.length
    ? await boardDataset.getStock(compArticles).catch(() => [])
    : []
  const stockByArticle = new Map<string, number>()
  for (const f of stockFlows) {
    const sub = (f.origin as { subType?: string })?.subType
    if (sub === 'strict' || sub === 'qc') {
      stockByArticle.set(f.article, (stockByArticle.get(f.article) ?? 0) + f.quantity)
    }
  }
  const receptionFlows = await boardDataset.getReceptions().catch(() => [])
  const now = new Date()

  const bom = components.map((comp) => {
    const need = comp.linkQuantity * line.quantite
    let available = stockByArticle.get(comp.componentArticle) ?? 0
    for (const rec of receptionFlows) {
      if (rec.article === comp.componentArticle && rec.date && rec.date <= now)
        available += rec.quantity
    }
    const ok = available >= need
    return {
      article: comp.componentArticle,
      description: comp.componentDescription,
      need: String(nFr(need)),
      available: String(nFr(available)),
      unit: '',
      ok,
      shortage: ok ? null : String(nFr(need - available)),
    }
  })
  const bomBlocked = bom.filter((b) => !b.ok).length

  return {
    numCommande: line.numCommande,
    ligne: line.ligne,
    article: line.article,
    designation: line.designation,
    client: line.client,
    quantite: nFr(line.quantite),
    unite: line.unite,
    dateLivraison: fmtFr(overrideDate ? new Date(overrideDate) : line.dateLivraison),
    contremarque: line.contremarque,
    orderType: line.orderType,
    nature: line.nature,
    hasOverride: overrideMap.has(overrideKey),
    workstation,
    workstationLabel,
    hours: nFr(hours),
    bom,
    bomCount: bom.length,
    bomBlocked,
    x3Error: null as string | null,
  }
}
