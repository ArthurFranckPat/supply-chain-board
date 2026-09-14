/**
 * Assemblage du payload « Synthèse matières » du séquenceur.
 *
 * Réutilise TEL QUEL le pipeline de `board-feasibility` (`loadOrderImpacts`, pipeline
 * 'board-badges') : appelé avec la même fenêtre et le même poste que le bouton
 * « Faisabilité » qui vient de tourner, il tape le même cache — la synthèse ne relance
 * donc aucun calcul X3. Le seul travail propre à cet endpoint est le pivot composant
 * (`buildMaterialShortageSummary`) et la jointure des réceptions d'achat.
 *
 * LIMITE ASSUMÉE — le verdict par OF vient de l'override MFGMAT (snapshot, pipeline
 * 'board-badges', `preferEngineFeasibility: false`) : deux OF qui se disputent le stock
 * d'un même composant sont jugés chacun de leur côté, sans consommation virtuelle entre
 * eux. Les quantités manquantes sommées ici sont donc une BORNE BASSE : la contention
 * entre OF n'y apparaît pas. C'est le prix de la parité badge == détail (issue #11), et
 * c'est le même compromis que /ruptures. Ne pas « corriger » sans casser cette parité.
 */

import boardDataset from '#services/board_dataset'
import { loadOrderImpacts } from '#services/order_impacts_loader'
import {
  buildMaterialShortageSummary,
  type MaterialSummaryRow,
  type MaterialSummaryStats,
  type SummaryScopeOf,
} from '#app/domain/material_shortage_summary'
import {
  groupReceptionsByArticle,
  RECEPTION_LOOKBACK_DAYS,
} from '#repositories/reception_repository'
import type { ReceptionRecord } from '#app/domain/recursive_checker'

export interface MaterialSummaryParams {
  from: Date
  to: Date
  workstation?: string
  mode?: 'immediate' | 'sequential'
  /** OF visibles à l'écran (périmètre exact du listing), avec leur date de début. */
  scope: SummaryScopeOf[]
  /** false = inclure aussi les sous-ensembles fabriqués manquants. Défaut : achetés seuls. */
  purchasedOnly?: boolean
  force?: boolean
}

export async function loadMaterialShortageSummary(params: MaterialSummaryParams): Promise<{
  rows: MaterialSummaryRow[]
  stats: MaterialSummaryStats
  x3Error: string | null
}> {
  try {
    const { result, articles } = await loadOrderImpacts({
      from: params.from,
      to: params.to,
      workstation: params.workstation,
      mode: params.mode,
      force: !!params.force,
      pipeline: 'board-badges',
    })

    // Réceptions COUVRANTES = PORDERQ complet (cache SWR global partagé avec /ruptures et
    // le détail OF), NON borné à la fenêtre : un PO qui arrive après la fenêtre doit donner
    // « retard », pas un faux « sans couverture » qui ferait recommander en double.
    // Lookback : on garde les PO attendues dans le passé et non reçues (retards de livraison).
    const receptionFrom = new Date()
    receptionFrom.setDate(receptionFrom.getDate() - RECEPTION_LOOKBACK_DAYS)
    receptionFrom.setHours(0, 0, 0, 0)
    const receptionsByArticle = await boardDataset
      .getReceptions()
      .then((flows) => groupReceptionsByArticle(flows, receptionFrom))
      .catch(() => new Map<string, ReceptionRecord[]>())

    const { rows, stats } = buildMaterialShortageSummary(
      result,
      params.scope,
      receptionsByArticle,
      articles,
      { purchasedOnly: params.purchasedOnly }
    )
    return { rows, stats, x3Error: null }
  } catch (e) {
    return {
      rows: [],
      stats: {
        nbComposants: 0,
        nbOfBloques: 0,
        nbSansCouverture: 0,
        nbRetard: 0,
        nbOfHorsPerimetre: 0,
      },
      x3Error: (e as Error).message,
    }
  }
}
