import { Show, createMemo, createSignal, type Component } from 'solid-js'
import { createColumnHelper } from '@tanstack/solid-table'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { ShortageDisplayRow, ShortageStats } from '@/lib/shortages/types'
import { cn } from '@/libs/cn'

/**
 * Tableau du suivi des ruptures. Port Solid de `shortage_table.edge` : bandeau stats +
 * grille (une ligne par couple composant × OF bloqué) + états vide / erreur X3.
 * Les lignes arrivent déjà formatées du serveur (cf. ShortageDisplayRow).
 */
export const ShortageTable: Component<{
  rows: ShortageDisplayRow[]
  stats: ShortageStats
  x3Error: string | null
  onSelectOf: (numOf: string) => void
}> = (props) => {
  const helper = createColumnHelper<ShortageDisplayRow>()

  const columns = [
    helper.accessor('component', {
      header: () => 'Composant',
      cell: (info) => (
        <>
          <div class="font-bold text-foreground mono">{info.getValue()}</div>
          <div class="text-[10px] text-muted-foreground truncate max-w-[18rem]">{info.row.original.componentDesc}</div>
        </>
      ),
      meta: { thClass: 'text-left px-3 py-2', tdClass: 'px-3 py-2 align-top' },
    }),
    helper.accessor('qteManquante', {
      header: () => 'Qté manq.',
      cell: (info) => <span class="mono font-bold text-error">{info.getValue()}</span>,
      meta: { thClass: 'text-right px-3 py-2 w-24', tdClass: 'px-3 py-2 text-right align-top' },
    }),
    helper.accessor('numOf', {
      header: () => 'OF bloqué',
      cell: (info) => {
        const row = info.row.original
        return (
          <>
            <button
              type="button"
              onClick={() => props.onSelectOf(row.numOf)}
              class="font-bold text-primary hover:underline mono cursor-pointer"
            >
              {row.numOf}
            </button>
            <div class="text-[10px] text-muted-foreground mono truncate max-w-[10rem]">{row.articleParent}</div>
          </>
        )
      },
      meta: { thClass: 'text-left px-3 py-2 w-44', tdClass: 'px-3 py-2 align-top' },
    }),
    helper.accessor('numCommande', {
      header: () => 'Commande client',
      cell: (info) => {
        const row = info.row.original
        return (
          <Show
            when={row.hasCommande}
            fallback={<span class="text-muted-foreground/60 italic">—</span>}
          >
            <div class="font-bold text-foreground mono">{row.numCommande}</div>
            <div class="text-[10px] text-muted-foreground truncate max-w-[10rem]">{row.client}</div>
          </Show>
        )
      },
      meta: { thClass: 'text-left px-3 py-2 w-44', tdClass: 'px-3 py-2 align-top' },
    }),
    helper.accessor('dateExpedition', {
      header: () => 'Date expé.',
      cell: (info) => <>{info.getValue() || '—'}</>,
      sortingFn: 'text',
      meta: { thClass: 'text-left px-3 py-2 w-24', tdClass: 'px-3 py-2 mono text-muted-foreground align-top whitespace-nowrap' },
    }),
    helper.display({
      id: 'reception',
      enableSorting: false,
      header: () => 'Réception attendue',
      cell: (info) => {
        const rec = info.row.original.reception
        return (
          <Show
            when={rec}
            fallback={
              <span class="inline-flex items-center gap-1 text-[10px] font-bold text-error uppercase">
                <span class="material-symbols-outlined text-[13px]">block</span> Aucune couverture prévue
              </span>
            }
          >
            {(r) => (
              <>
                <div class="font-bold text-foreground mono">{r().id}</div>
                <div class="text-[10px] text-muted-foreground truncate max-w-[16rem]">
                  {r().supplier} · {r().qty}
                </div>
              </>
            )}
          </Show>
        )
      },
      meta: { thClass: 'text-left px-3 py-2', tdClass: 'px-3 py-2 align-top' },
    }),
    helper.accessor('dateArrivee', {
      header: () => 'Date arrivée',
      cell: (info) => {
        const v = info.getValue()
        const late = info.row.original.arriveeLate
        return (
          <span class={cn('mono align-top whitespace-nowrap', late ? 'text-error font-bold' : 'text-muted-foreground')}>
            <Show when={v} fallback={<span class="text-muted-foreground/60">—</span>}>
              <span class="inline-flex items-center gap-1">
                <Show when={late}>
                  <span class="material-symbols-outlined text-[13px]">warning</span>
                </Show>
                {v}
              </span>
            </Show>
          </span>
        )
      },
      meta: { thClass: 'text-left px-3 py-2 w-24', tdClass: 'px-3 py-2 mono align-top' },
    }),
    helper.display({
      id: 'verdict',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info) => {
        const row = info.row.original
        return (
          <span
            class={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 border rounded-full text-[10px] font-bold whitespace-nowrap',
              row.verdictCls
            )}
          >
            <span class="material-symbols-outlined text-[12px]">{row.verdictIcon}</span>
            {row.verdictLabel}
          </span>
        )
      },
      meta: { thClass: 'text-left px-3 py-2 w-40', tdClass: 'px-3 py-2 align-top' },
    }),
  ]

  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'dateArrivee', desc: false }])

  const sortRows = (rows: ShortageDisplayRow[], sorting: SortingState[]): ShortageDisplayRow[] => {
    if (sorting.length === 0) return rows
    const { id, desc } = sorting[0]
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let va: string | number
      let vb: string | number
      switch (id) {
        case 'component':
          va = a.component
          vb = b.component
          break
        case 'qteManquante':
          va = parseFloat(a.qteManquante)
          vb = parseFloat(b.qteManquante)
          break
        case 'numOf':
          va = a.numOf
          vb = b.numOf
          break
        case 'numCommande':
          va = a.numCommande
          vb = b.numCommande
          break
        case 'dateExpedition':
          va = a.dateExpedition
          vb = b.dateExpedition
          break
        case 'dateArrivee':
          va = a.dateArrivee
          vb = b.dateArrivee
          break
        default:
          return 0
      }
      let cmp = 0
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va < vb ? -1 : va > vb ? 1 : 0
      } else {
        cmp = String(va).localeCompare(String(vb))
      }
      if (cmp !== 0) return cmp
      return a.component.localeCompare(b.component)
    })
    return desc ? sorted.reverse() : sorted
  }

  const sortedRows = createMemo(() => sortRows(props.rows, sorting()))

  return (
    <div class="flex-1 flex flex-col min-h-0">
      <Show when={props.x3Error}>
        <div class="mb-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-xs rounded flex items-center gap-2">
          <span class="material-symbols-outlined text-sm">warning</span>
          X3 injoignable — {props.x3Error}.
        </div>
      </Show>

      {/* Bandeau stats */}
      <div class="mb-2 flex items-center gap-2">
        <div class="flex items-center gap-2 bg-card border border-border rounded px-3 py-1.5 shadow-sm">
          <span class="material-symbols-outlined text-[16px] text-muted-foreground">analytics</span>
          <span class="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {props.stats.nbRuptures} rupture(s)
          </span>
        </div>
        <div class="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded px-3 py-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-500" />
          <span class="text-[11px] font-bold text-emerald-700">{props.stats.nbCouvertes} couverte(s)</span>
        </div>
        <div class="flex items-center gap-1.5 bg-error/10 border border-error/20 rounded px-3 py-1.5">
          <span class="w-2 h-2 rounded-full bg-error" />
          <span class="text-[11px] font-bold text-error">{props.stats.nbSansCouverture} sans couverture</span>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={sortedRows}
        sorting={sorting}
        onSortingChange={setSorting}
        tableClass="text-xs"
        scrollContainerClass="flex-1 bg-card border border-border rounded shadow-sm"
        theadRowClass="text-[10px] font-bold uppercase text-muted-foreground border-b border-border"
        getRowClass={() => 'border-b border-border/60 hover:bg-muted/40 transition-colors'}
        emptyState={
          <div class="px-3 py-16 text-center text-muted-foreground">
            <Show
              when={!props.x3Error}
              fallback={<span class="italic">Données indisponibles.</span>}
            >
              <div class="flex flex-col items-center gap-2">
                <span class="material-symbols-outlined text-[32px] text-emerald-400">check_circle</span>
                <span class="text-sm font-medium">Aucune rupture détectée dans la fenêtre.</span>
              </div>
            </Show>
          </div>
        }
      />
    </div>
  )
}

export default ShortageTable
