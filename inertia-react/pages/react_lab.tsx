import React, { useState } from 'react'
import { Head } from '@inertiajs/react'
import { Button } from 'carbon-react'
import { toast } from 'sonner'
import Masthead from '../components/masthead'
import DataTable, { type ColumnDef, type SortingState } from '../components/ui/data-table'

interface MockRow {
  id: string
  name: string
  quantity: number
}

const MOCK_ROWS: MockRow[] = [
  { id: 'OF001', name: 'Article A - Montage', quantity: 50 },
  { id: 'OF002', name: 'Article B - Fabrication', quantity: 120 },
  { id: 'OF003', name: 'Article C - Profilage', quantity: 80 },
]

const COLUMNS: ColumnDef<MockRow>[] = [
  { accessorKey: 'id', header: 'Code OF', enableSorting: true },
  { accessorKey: 'name', header: 'Nom de l\'OF', enableSorting: true },
  { accessorKey: 'quantity', header: 'Quantité', enableSorting: true },
]

export default function ReactLab() {
  const [sorting, setSorting] = useState<SortingState[]>([])
  
  const triggerToast = () => {
    toast.success('Le double-runtime React + Carbon fonctionne !', {
      description: 'Toast émis depuis le Toaster React / Sonner',
    })
  }

  return (
    <>
      <Head title="Laboratoire React + Carbon" />
      <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
        <Masthead subtitle="Laboratoire de test" active="dashboard" />
        
        <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-[1fr_350px] gap-8 items-start">
          {/* Table Validation zone */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Validation DataTable (Carbon + Virtualisation)</h2>
            <div className="h-[300px]">
              <DataTable
                columns={COLUMNS}
                rows={MOCK_ROWS}
                sorting={sorting}
                onSortingChange={setSorting}
                getRowKey={(r) => r.id}
                tableClass="bg-card"
              />
            </div>
          </div>

          {/* Test Controls zone */}
          <div className="bg-[var(--color-panel)] border border-[var(--color-line)] p-8 rounded-lg shadow-md text-center space-y-6">
            <h1 className="text-xl font-bold tracking-tight">Contrôles du Laboratoire</h1>
            
            <p className="text-sm text-[var(--colorsUtilityYin065)]">
              Cette page valide la <strong>Phase 1</strong> (Fondations UI : Masthead Carbon &amp; DataTable).
            </p>

            <div className="flex flex-col space-y-3 justify-center pt-2">
              <Button
                buttonType="primary"
                onClick={triggerToast}
              >
                Déclencher un Toast
              </Button>
              
              <Button
                buttonType="secondary"
                onClick={() => toast.info('Bouton secondaire cliqué !')}
              >
                Bouton Secondaire
              </Button>
            </div>

            <div className="pt-6 border-t border-[var(--color-line-soft)] text-xs text-[var(--colorsUtilityYin055)] flex justify-between">
              <span>Runtime: <strong>React 18.3.1</strong></span>
              <span>Compiler: <strong>Actif</strong></span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
