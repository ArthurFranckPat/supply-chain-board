import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ActionReportPayload } from '../types'
import { ActionsView } from './ActionsView'
import { ReportsView } from './ReportsView'

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
            name: 'schedule_report.md',
            path: '/tmp/schedule_report.md',
            category: 'outputs',
            updated_at: '2026-03-31T18:10:00Z',
            size_bytes: 4096,
          },
        ]}
        embeddedReports={null}
        onInspect={onInspect}
        onRefresh={onRefresh}
      />,
    )

    fireEvent.click(screen.getByText('Rafraîchir'))
    fireEvent.click(screen.getByText('schedule_report.md'))

    expect(onRefresh).toHaveBeenCalled()
    expect(onInspect).toHaveBeenCalled()
    expect(screen.getByText('Markdown disponibles')).toBeInTheDocument()
  })
})
