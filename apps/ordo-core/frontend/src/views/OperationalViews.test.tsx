import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActionReportPayload, RunState } from '../types'
import { ActionsView } from './ActionsView'
import { ReportsView } from './ReportsView'
import { S1View } from './S1View'

const sampleRun: RunState = {
  run_id: 'run-1',
  status: 'completed',
  created_at: '2026-03-31T18:00:00Z',
  kind: 's1',
  result: {
    reference_date: '2026-03-31',
    source: { source: 'data' },
    summary: {
      horizon_days: 7,
      include_previsions: false,
      feasibility_mode: 'projected',
      besoins_s1: 12,
      matched_ofs: 8,
      feasible_ofs: 5,
      non_feasible_ofs: 3,
      action_components: 2,
      kanban_postes: 1,
    },
    of_results: [
      {
        num_of: 'OF-100',
        article: 'PF-ALPHA',
        date_debut: '2026-04-01',
        date_fin: '2026-04-02',
        qte_restante: 42,
        commande: 'CMD-200',
        commande_article: 'ART-200',
        commande_date_expedition: '2026-04-03',
        matching_method: 'MTS',
        feasible: false,
        missing_components: { COMP_X: 3, COMP_Y: 1 },
        alerts: ['Alerte'],
      },
    ],
    action_report: {
      component_lines: [],
      supplier_lines: [],
      poste_kanban_lines: [],
      impacted_ofs: 1,
      impacted_commandes: 1,
    },
    reports: {
      actions: {
        type: 'actions',
        path: '/tmp/actions.md',
        exists: true,
        content: '# Actions',
        updated_at: '2026-03-31T18:10:00Z',
      },
      s1: {
        type: 's1',
        path: '/tmp/s1.md',
        exists: true,
        content: '# S1',
        updated_at: '2026-03-31T18:10:00Z',
      },
    },
  },
}

const sampleActionReport: ActionReportPayload = {
  component_lines: [
    {
      article_composant: 'COMP_X',
      missing_qty_total: 12,
      nb_commandes_impactees: 3,
      nb_ofs_impactes: 2,
      niveau_action: 'RETARD_FOURNISSEUR',
      action_recommandee: 'Relancer',
    },
  ],
  supplier_lines: [
    {
      fournisseur: 'SUP-01',
      num_commande_achat: 'CA-99',
      articles_concernes: ['COMP_X', 'COMP_Y'],
    },
  ],
  poste_kanban_lines: [
    {
      poste_fournisseur: 'PP_145',
      libelle_poste_fournisseur: 'PREREGLAGE',
      articles_kanban_concernes: ['MH7624'],
      action_recommandee: 'Maintenir',
    },
  ],
  impacted_ofs: 2,
  impacted_commandes: 3,
}

describe('Operational views', () => {
  it('opens OF detail from S1View', () => {
    const onInspect = vi.fn()

    render(<S1View runState="success" data={sampleRun} onInspect={onInspect} />)

    fireEvent.click(screen.getByText('OF-100'))

    expect(onInspect).toHaveBeenCalled()
    expect(screen.getByText('Faisabilité OF')).toBeInTheDocument()
    expect(screen.getByText('Bloqué')).toBeInTheDocument()
  })

  it('renders actions and forwards detail inspection', () => {
    const onInspect = vi.fn()

    render(<ActionsView data={sampleActionReport} onInspect={onInspect} />)

    fireEvent.click(screen.getByText('COMP_X'))
    fireEvent.click(screen.getByText('SUP-01'))

    expect(screen.getByText('Composants bloquants')).toBeInTheDocument()
    expect(screen.getByText('Fournisseurs et postes kanban')).toBeInTheDocument()
    expect(onInspect).toHaveBeenCalledTimes(2)
  })

  it('renders reports and refresh action', () => {
    const onInspect = vi.fn()
    const onRefresh = vi.fn()

    render(
      <ReportsView
        reports={[
          {
            name: 's1_action_report.md',
            path: '/tmp/s1_action_report.md',
            category: 'actions',
            updated_at: '2026-03-31T18:10:00Z',
            size_bytes: 4096,
          },
        ]}
        embeddedReports={sampleRun.result?.reports ?? null}
        onInspect={onInspect}
        onRefresh={onRefresh}
      />,
    )

    fireEvent.click(screen.getByText('Rafraîchir'))
    fireEvent.click(screen.getByText('s1_action_report.md'))

    expect(onRefresh).toHaveBeenCalled()
    expect(onInspect).toHaveBeenCalled()
    expect(screen.getByText('Markdown disponibles')).toBeInTheDocument()
  })
})
