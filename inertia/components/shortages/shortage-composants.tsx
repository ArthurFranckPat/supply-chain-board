/**
 * Vue R2 « Par composant » du suivi des ruptures (issue #52) : agrégation « quel composant fait
 * le plus de dégâts ? » (nb OFs bloqués, qté totale, commande la plus urgente).
 *
 * L'agrégation (groupByComponent) est une dérivation pure (lib/shortages/
 * shortage-math.ts) ; cette vue utilise le DataTable de l'application.
 */
import { For, Show, createMemo, createSignal, type Accessor, type Component, type JSXElement } from 'solid-js'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cx } from '@/libs/cva'
import {
  VERDICT_BADGE,
  groupByComponent,
  type ComponentGroup,
  TH,
  TH_R,
  TD,
} from '@/lib/shortages/shortage-math'

export const ShortageComposants: Component<{
  rows: Accessor<ShortageDisplayRow[]>
  onSelectOf: (numOf: string) => void
  emptyState: JSXElement
  selectedOf: Accessor<string | null>
}> = (props) => {
  const groups = createMemo(() => groupByComponent(props.rows()))
  const fmtTotal = (n: number) => {
    const r = Math.round(n * 100) / 100
    return Number.isInteger(r) ? String(r) : r.toLocaleString('fr-FR')
  }

  // Tri par défaut : nombre d'OFs bloqués desc, puis quantité totale desc
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'nbOfs', desc: true }])

  const sortedGroups = createMemo(() => {
    const raw = groups()
    const sort = sorting()[0]
    if (!sort) return raw
    const { id, desc } = sort

    return [...raw].sort((a, b) => {
      if (id === 'nbOfs') {
        const diff = a.lines.length - b.lines.length
        return desc ? -diff : diff
      }
      if (id === 'totalManquant') {
        const diff = a.totalManquant - b.totalManquant
        return desc ? -diff : diff
      }
      if (id === 'component') {
        return desc
          ? b.component.localeCompare(a.component)
          : a.component.localeCompare(b.component)
      }
      return 0
    })
  })

  const columns = [
    {
      accessorKey: 'component',
      header: () => 'Composant · Désignation',
      cell: (info: { row: { original: ComponentGroup } }) => {
        const g = info.row.original
        return (
          <>
            <div class="font-mono text-[14px] font-bold tracking-tight text-foreground">
              {g.component}
            </div>
            <div class="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {g.componentDesc}
            </div>
          </>
        )
      },
      meta: { thClass: `w-[240px] ${TH}`, tdClass: `w-[240px] ${TD}` },
    },
    {
      accessorKey: 'totalManquant',
      header: () => 'Qté manq. totale',
      cell: (info: { row: { original: ComponentGroup } }) => {
        const g = info.row.original
        const late = g.worstVerdict === 'retard' || g.worstVerdict === 'sans_couverture'
        return (
          <span
            class={cx(
              'font-sans font-bold tabular-nums text-[12.5px] leading-none',
              late ? 'text-destructive' : 'text-foreground'
            )}
          >
            {fmtTotal(g.totalManquant)}
            <span class="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
          </span>
        )
      },
      meta: { thClass: `w-[110px] ${TH_R}`, tdClass: `w-[110px] whitespace-nowrap text-right ${TD}` },
    },
    {
      id: 'nbOfs',
      accessorKey: 'lines', // shim pour que accessorKey matche une clé existante du type
      header: () => 'OFs bloqués',
      cell: (info: { row: { original: ComponentGroup } }) => {
        const g = info.row.original
        return (
          <span class="font-sans font-bold tabular-nums text-[12.5px] leading-none text-foreground">
            {g.lines.length}
          </span>
        )
      },
      meta: { thClass: `w-[90px] ${TH_R}`, tdClass: `w-[90px] whitespace-nowrap text-right ${TD}` },
    },
    {
      id: 'ofs',
      enableSorting: false,
      header: () => 'OFs',
      cell: (info: { row: { original: ComponentGroup } }) => {
        const g = info.row.original
        return (
          <div class="flex flex-wrap gap-1">
            <For each={g.lines.slice(0, 4)}>
              {(l) => (
                <button
                  type="button"
                  onClick={() => props.onSelectOf(l.numOf)}
                  title={`${l.articleParent} · ${l.articleParentDesc} — manque ${l.qteManquante} u`}
                  class={cx(
                    'cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold transition-colors hover:border-brand hover:text-brand',
                    l.verdictKey === 'sans_couverture'
                      ? 'border-destructive/30 text-destructive'
                      : 'border-rule text-secondary-foreground'
                  )}
                >
                  {l.numOf}
                </button>
              )}
            </For>
            <Show when={g.lines.length > 4}>
              <span
                class="rounded border border-rule bg-card px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-muted-foreground cursor-help"
                title={g.lines.slice(4).map((l) => l.numOf).join(', ')}
              >
                +{g.lines.length - 4}
              </span>
            </Show>
          </div>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      id: 'urgent',
      enableSorting: false,
      header: () => 'Commande la plus urgente',
      cell: (info: { row: { original: ComponentGroup } }) => {
        const g = info.row.original
        const u = g.urgent
        const late = g.worstVerdict === 'retard' || g.worstVerdict === 'sans_couverture'
        return (
          <Show
            when={u}
            fallback={
              <span class="font-sans text-[11px] italic text-muted-foreground/50">— orphelins</span>
            }
          >
            <div class="flex items-baseline gap-1.5">
              <span class="font-mono text-[12px] font-semibold text-secondary-foreground">
                {u!.numCommande}
              </span>
              <span
                class={cx(
                  'font-mono text-[11px] font-bold',
                  late ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {u!.dateExpedition}
              </span>
            </div>
            <div class="mt-0.5 truncate max-w-[13rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {u!.client}
            </div>
          </Show>
        )
      },
      meta: { thClass: `w-[210px] ${TH}`, tdClass: `w-[210px] ${TD}` },
    },
    {
      id: 'worstVerdict',
      enableSorting: false,
      header: () => 'Couverture',
      cell: (info: { row: { original: ComponentGroup } }) => {
        const g = info.row.original
        return (
          <Show
            when={g.nbSansCouverture > 0}
            fallback={
              <span
                class={cx(
                  'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
                  VERDICT_BADGE[g.worstVerdict].cls
                )}
              >
                {VERDICT_BADGE[g.worstVerdict].label}
              </span>
            }
          >
            <span class="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-destructive">
              {g.nbSansCouverture}/{g.lines.length} sans couv.
            </span>
          </Show>
        )
      },
      meta: {
        thClass: `w-[150px] ${TH.replace('border-r border-rule-soft', '')}`,
        tdClass: `w-[150px] px-4 py-[13px] align-middle`,
      },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: `w-[38px] ${TH}`,
    tdClass: (row: ComponentGroup) => {
      const late = row.worstVerdict === 'retard' || row.worstVerdict === 'sans_couverture'
      return cx(
        'px-4 py-[13px] align-middle font-mono text-[11px] font-bold leading-none text-muted-foreground/80 border-r border-rule-soft',
        late && '[box-shadow:inset_3px_0_var(--color-destructive)]'
      )
    },
  }

  return (
    <DataTable
      columns={columns}
      rows={sortedGroups}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[1080px] text-xs table-fixed w-full"
      scrollContainerClass="h-full border-0 rounded-none shadow-none"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowClass={() => 'border-t border-rule-soft hover:bg-foreground/[0.04] transition-colors'}
      selectedRowKey={props.selectedOf}
      getRowKey={(row: ComponentGroup) => {
        const sel = props.selectedOf()
        if (sel && row.lines.some((l) => l.numOf === sel)) {
          return sel
        }
        return ''
      }}
      emptyState={props.emptyState}
    />
  )
}

export default ShortageComposants
