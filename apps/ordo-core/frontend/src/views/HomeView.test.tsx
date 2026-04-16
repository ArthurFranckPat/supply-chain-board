import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HomeView } from './HomeView'

describe('HomeView', () => {
  it('renders extraction source and triggers actions', () => {
    const setSource = vi.fn()
    const onLoadSource = vi.fn()
    const onRunS1 = vi.fn()

    render(
      <HomeView
        source="extractions"
        setSource={setSource}
        loadState="ready"
        runState="idle"
        lastSourceSnapshot={{ source: 'extractions' }}
        onLoadSource={onLoadSource}
        onRunS1={onRunS1}
      />,
    )

    expect(screen.getByText('Extractions ERP')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Extractions ERP'))
    expect(setSource).toHaveBeenCalledWith('extractions')

    fireEvent.click(screen.getByText('Charger la source'))
    expect(onLoadSource).toHaveBeenCalled()

    fireEvent.click(screen.getByText('Lancer le run S+1'))
    expect(onRunS1).toHaveBeenCalled()
  })
})
