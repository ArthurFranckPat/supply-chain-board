/**
 * Vue R1 « Registre » du suivi des ruptures (issue #52 — extraite de
 * components/shortages/shortage-table.tsx) : table éditoriale dense, une ligne
 * par couple composant × OF bloqué, colonnes triables via le DataTable maison.
 *
 * Les lignes arrivent déjà filtrées du parent (scheduler/shortages) ; le tri
 * est géré localement par le DataTable.
 */
import { For, Show, createSignal, type Accessor, type Component, type JSXElement } from 'solid-js'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cx } from '@/libs/cva'
import { isLate, TH, TH_R, TD } from '@/lib/shortages/shortage-math'

export const ShortageRegistre: Component<{
  rows: Accessor<ShortageDisplayRow[]>
  onSelectOf: (numOf: string) => void
  emptyState: JSXElement
}> = (props) => {
  // Tri par défaut : composant alphabétique. L'ordre par urgence (expé asc) vient déjà
  // du serveur ; l'utilisateur peut retrier en cliquant les en-têtes triables.
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'component', desc: false }])

  const columns = [
    {
      accessorKey: 'component',
      header: () => 'Composant',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <div class="font-mono text-[14px] font-bold tracking-tight text-foreground">
              {row.component}
            </div>
            <div class="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {row.componentDesc}
            </div>
          </>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      accessorKey: 'qteManquante',
      header: () => 'Qté manq.',
      // Ne crie pas « alerte » par défaut : la gravité est portée par le VERDICT, pas par
      // l'ampleur (2 pcs sans couverture > 1000 pcs couvertes). Taille réduite, neutre ;
      // rouge uniquement sur les lignes en alerte.
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <span
            class={cx(
              'font-fraunces text-[14px] font-bold tabular-nums leading-none',
              isLate(row) ? 'text-destructive' : 'text-foreground'
            )}
          >
            {row.qteManquante}
            <span class="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
          </span>
        )
      },
      meta: { thClass: `w-[80px] ${TH_R}`, tdClass: `w-[80px] whitespace-nowrap text-right ${TD}` },
    },
    {
      accessorKey: 'numOf',
      header: () => 'OF bloqué',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <button
              type="button"
              onClick={() => props.onSelectOf(row.numOf)}
              class="cursor-pointer font-mono text-[12px] font-semibold text-brand hover:underline"
            >
              {row.numOf}
            </button>
            <div class="mt-0.5 truncate max-w-[11rem] font-mono text-[10.5px] text-muted-foreground">
              <span class="font-semibold">{row.articleParent}</span>
              <Show when={row.articleParentDesc}>
                <span class="font-sans font-normal"> · {row.articleParentDesc}</span>
              </Show>
            </div>
          </>
        )
      },
      meta: { thClass: `w-[170px] ${TH}`, tdClass: `w-[170px] ${TD}` },
    },
    {
      accessorKey: 'numCommande',
      header: () => 'Commande',
      // N° + expé (relative) sur la 1re ligne ; client en sous-titre. Les +N commandes
      // restent en chip discret — l'essentiel est « pour qui, quand ».
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <Show
            when={row.hasCommande}
            fallback={
              <span class="font-sans text-[11px] italic text-muted-foreground/50">— orphelin</span>
            }
          >
            <div class="flex items-baseline gap-1.5">
              <span class="font-mono text-[12px] font-semibold text-secondary-foreground">
                {row.numCommande}
              </span>
              <Show when={row.dateExpedition}>
                <span
                  class={cx(
                    'font-mono text-[11px] font-bold',
                    isLate(row) ? 'text-destructive' : 'text-muted-foreground'
                  )}
                  title={`Expé : ${row.dateExpeditionIso ?? ''}`}
                >
                  {row.dateExpedition}
                </span>
              </Show>
              <Show when={row.autresCommandes.length > 0}>
                <span
                  class="rounded bg-brand-soft px-1 font-mono text-[9px] font-bold text-brand"
                  title={`Aussi : ${row.autresCommandes.join(', ')}`}
                >
                  +{row.autresCommandes.length}
                </span>
              </Show>
            </div>
            <div class="mt-0.5 truncate max-w-[11rem] font-sans text-[11px] leading-snug text-muted-foreground">
              {row.client}
            </div>
          </Show>
        )
      },
      meta: { thClass: `w-[180px] ${TH}`, tdClass: `w-[180px] ${TD}` },
    },
    {
      id: 'reception',
      enableSorting: false,
      header: () => 'Réception attendue',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        const rec = row.reception
        return (
          <Show
            when={rec}
            fallback={
              <Show
                when={row.verdictKey === 'sous_ensemble'}
                fallback={
                  // Le verdict « Sans couverture » porte déjà l'alerte — la cellule reste
                  // neutre, pas la peine de répéter « aucune réception » en rouge.
                  <span class="text-muted-foreground/50">—</span>
                }
              >
                <Show
                  when={row.sousEnsembleOfs.length > 0}
                  fallback={<span class="text-muted-foreground/50">—</span>}
                >
                  <div class="flex flex-wrap items-center gap-1">
                    <For each={row.sousEnsembleOfs.slice(0, 3)}>
                      {(numOf) => (
                        <button
                          type="button"
                          onClick={() => props.onSelectOf(numOf)}
                          class="cursor-pointer rounded border border-planifie/30 px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-planifie transition-colors hover:border-brand hover:text-brand"
                        >
                          {numOf}
                        </button>
                      )}
                    </For>
                    <Show when={row.sousEnsembleOfs.length > 3}>
                      <span class="font-mono text-[10px] text-muted-foreground">
                        +{row.sousEnsembleOfs.length - 3}
                      </span>
                    </Show>
                  </div>
                </Show>
              </Show>
            }
          >
            {(r) => (
              <>
                <div class="font-mono text-[11px] font-semibold text-muted-foreground">
                  {r().id}
                </div>
                <div class="mt-0.5 truncate max-w-[14rem] font-sans text-[11px] leading-snug text-muted-foreground">
                  {r().supplier} · {r().qty}u · {r().dateArrivee}
                </div>
              </>
            )}
          </Show>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      id: 'verdict',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <span
            class={cx(
              'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
              row.verdictCls
            )}
          >
            {row.verdictLabel}
          </span>
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
    tdClass: (row: ShortageDisplayRow) =>
      cx(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]'
      ),
  }

  return (
    <DataTable
      columns={columns}
      rows={props.rows}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[880px] text-xs"
      scrollContainerClass="h-full border-0 rounded-none shadow-none"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowClass={(row) =>
        cx(
          'border-t border-rule-soft transition-colors',
          isLate(row)
            ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
            : 'hover:bg-foreground/[0.04]'
        )
      }
      emptyState={props.emptyState}
    />
  )
}

export default ShortageRegistre
