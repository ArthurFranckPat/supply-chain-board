import { For, Show, createMemo, createSignal, type Accessor, type Component } from 'solid-js'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { DayChargeDisplay, ReceptionDisplayRow } from '@/lib/receptions/types'
import { cx } from '@/libs/cva'

/**
 * Vues des réceptions fournisseurs (design system « Papier », harmonisé avec /ruptures
 * et /expeditions).
 *
 * - `ReceptionTableau` : table éditoriale dense — une ligne par réception attendue,
 *   colonnes triables via le DataTable maison (date, fournisseur, article, qté, palettes).
 * - `ReceptionCalendrier` : charge agrégée par jour — histogramme du nombre de palettes
 *   attendues chaque jour, avec drill-down (clic sur un jour → filtre le tableau).
 *
 * Les lignes arrivent déjà filtrées/triées du parent (page receptions) ; le tri du
 * tableau est géré localement par le DataTable.
 */

const TH =
  'px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft'
const TH_R = TH.replace('text-left', 'text-right')
const TD = 'px-4 py-[13px] align-middle border-r border-rule-soft'

/**
 * Palier de charge pour la couleur des barres (vue Calendrier).
 * Échelle absolue en palettes (pas de capacité camion ici — c'est une charge quai, pas
 * un remplissage). Calibrage empirique : > 20 = débord, 12-20 = fort, 5-12 = moyen, < 5 = léger.
 */
function chargeTier(palettes: number): 'bad' | 'warn' | 'mid' | 'ok' {
  if (palettes >= 20) return 'bad'
  if (palettes >= 12) return 'warn'
  if (palettes >= 5) return 'mid'
  return 'ok'
}
function chargeBg(tier: ReturnType<typeof chargeTier>): string {
  switch (tier) {
    case 'bad':
      return 'bg-destructive'
    case 'warn':
      return 'bg-suggere'
    case 'mid':
      return 'bg-planifie'
    case 'ok':
      return 'bg-ferme'
  }
}
function chargeText(tier: ReturnType<typeof chargeTier>): string {
  switch (tier) {
    case 'bad':
      return 'text-destructive'
    case 'warn':
      return 'text-suggere'
    case 'mid':
      return 'text-planifie'
    case 'ok':
      return 'text-ferme'
  }
}

// ───────────────────────────────────────────────────────────────────────────
// V1 · Tableau
// ───────────────────────────────────────────────────────────────────────────

export const ReceptionTableau: Component<{
  rows: Accessor<ReceptionDisplayRow[]>
  emptyState: import('solid-js').JSX.Element
}> = (props) => {
  // Tri par défaut : date asc (du plus proche au plus lointain). L'ordre du serveur est
  // déjà date asc puis fournisseur ; l'utilisateur peut retrier en cliquant les en-têtes.
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'date', desc: false }])

  const sortedRows = createMemo(() => {
    const rawRows = props.rows()
    const sort = sorting()[0]
    if (!sort) return rawRows

    const key = sort.id as keyof ReceptionDisplayRow
    const desc = sort.desc

    return [...rawRows].sort((a, b) => {
      const va = a[key]
      const vb = b[key]

      if (va === null || va === undefined) return desc ? -1 : 1
      if (vb === null || vb === undefined) return desc ? 1 : -1

      if (typeof va === 'string' && typeof vb === 'string') {
        return desc ? vb.localeCompare(va) : va.localeCompare(vb)
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return desc ? vb - va : va - vb
      }
      return 0
    })
  })

  const columns = [
    {
      accessorKey: 'date',
      header: () => 'Date',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => {
        const row = info.row.original
        return (
          <Show
            when={row.date}
            fallback={<span class="font-sans text-[11px] italic text-muted-foreground/50">—</span>}
          >
            <div class="font-mono text-[12px] font-bold tabular-nums text-foreground">
              {row.dateFmt}
            </div>
            <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.dateRelatif}</div>
          </Show>
        )
      },
      meta: { thClass: `w-[90px] ${TH}`, tdClass: `w-[90px] whitespace-nowrap ${TD}` },
    },
    {
      accessorKey: 'fournisseurNom',
      header: () => 'Fournisseur',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <div class="truncate max-w-[15rem] font-sans text-[12px] font-semibold text-secondary-foreground">
              {row.fournisseurNom}
            </div>
            <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">{row.fournisseur}</div>
          </>
        )
      },
      meta: { thClass: `w-[280px] ${TH}`, tdClass: `w-[280px] ${TD}` },
    },
    {
      accessorKey: 'article',
      header: () => 'Article',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">
              {row.article}
            </div>
            <Show when={row.designation}>
              <div class="mt-0.5 truncate max-w-[20rem] font-sans text-[11px] leading-snug text-muted-foreground">
                {row.designation}
              </div>
            </Show>
          </>
        )
      },
      meta: { thClass: `w-[280px] ${TH}`, tdClass: `w-[280px] ${TD}` },
    },
    {
      accessorKey: 'noCommande',
      header: () => 'Commande',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => (
        <span class="font-mono text-[11.5px] font-semibold text-foreground">
          {info.row.original.noCommande}
        </span>
      ),
      meta: { thClass: `w-[110px] ${TH}`, tdClass: `w-[110px] ${TD}` },
    },
    {
      accessorKey: 'qteUs',
      header: () => 'Qté US',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => {
        const row = info.row.original
        return (
          <span class="font-fraunces text-[14px] font-bold tabular-nums leading-none text-foreground">
            {row.qteUsFmt}
            <span class="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
          </span>
        )
      },
      meta: { thClass: `w-[90px] ${TH_R}`, tdClass: `w-[90px] whitespace-nowrap text-right ${TD}` },
    },
    {
      accessorKey: 'conditionnement',
      header: () => 'Conditionnement',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => {
        const row = info.row.original
        return (
          <div class="flex flex-col gap-0.5">
            <span
              class={cx(
                'font-mono text-[11px] tabular-nums',
                row.coefManquant ? 'text-muted-foreground/50' : 'text-muted-foreground'
              )}
            >
              {row.conditionnement}
            </span>
            <Show when={row.coefManquant}>
              <span
                class="inline-flex w-fit items-center gap-1 rounded bg-destructive/10 px-1 py-px font-mono text-[8.5px] font-bold uppercase tracking-wider text-destructive"
                title={`Coef manquant — US/UC: ${row.pcuStuCoe ?? '—'} · UC/pal: ${row.ucParPal ?? '—'}`}
              >
                <span class="material-symbols-outlined text-[10px]">warning</span>
                Coef manquant
              </span>
            </Show>
            <Show when={row.coefEstime}>
              <span
                class="inline-flex w-fit items-center gap-1 rounded bg-planifie/10 px-1 py-px font-mono text-[8.5px] font-bold uppercase tracking-wider text-planifie"
                title={`US/palette estimé par ${row.coefSource === 'STOCK' ? 'le stock actuel sur emplacements SM*' : "l'historique des rangements STOJOU (6 mois)"} — coef ITMMASTER absent`}
              >
                <span class="material-symbols-outlined text-[10px]">insights</span>
                Estimé ({row.coefSource})
              </span>
            </Show>
          </div>
        )
      },
      meta: { thClass: `w-[150px] ${TH}`, tdClass: `w-[150px] ${TD}` },
    },
    {
      accessorKey: 'nbPalettes',
      header: () => 'Palettes',
      cell: (info: { row: { original: ReceptionDisplayRow } }) => {
        const row = info.row.original
        const sansCoef = row.coefManquant
        const estime = row.coefEstime
        return (
          <span
            class={cx(
              'font-fraunces text-[15px] font-bold tabular-nums leading-none',
              sansCoef
                ? 'text-destructive/50'
                : estime
                  ? 'text-planifie'
                  : chargeText(chargeTier(row.nbPalettes))
            )}
            title={
              sansCoef
                ? 'Palette non calculée — conditionnement incomplet (cf. colonne Conditionnement)'
                : estime
                  ? `${row.nbPalettes} palette(s) — coef estimé (${row.coefSource})`
                  : `${row.nbPalettes} palette(s)`
            }
          >
            {row.nbPalettesFmt}
          </span>
        )
      },
      meta: { thClass: `w-[90px] ${TH_R}`, tdClass: `w-[90px] whitespace-nowrap text-right ${TD}` },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={sortedRows}
      sorting={sorting}
      onSortingChange={setSorting}
      tableClass="table-fixed"
      getRowClass={(row) =>
        cx(
          'border-t border-rule-soft hover:bg-foreground/[0.04]',
          // Surligne doucement les journées fortement chargées (> 20 pal.).
          row.nbPalettes >= 20 ? 'bg-destructive/[0.04]' : '',
          // Bordure gauche sur les lignes au conditionnement non référencé :
          //  - rouge (destructive) si AUCUNE estimation → charge réellement sous-estimée.
          //  - bleu (planifie) si coef estimé → charge calculée mais à fiabiliser.
          row.coefManquant
            ? 'bg-destructive/[0.04] [box-shadow:inset_3px_0_var(--color-destructive)]'
            : row.coefEstime
              ? 'bg-planifie/[0.04] [box-shadow:inset_3px_0_var(--color-planifie)]'
              : ''
        )
      }
      emptyState={props.emptyState}
    />
  )
}

// ───────────────────────────────────────────────────────────────────────────
// V2 · Calendrier / Charge par jour
// ───────────────────────────────────────────────────────────────────────────

const EMPTY_CHARGE: DayChargeDisplay[] = []

export const ReceptionCalendrier: Component<{
  charge: Accessor<DayChargeDisplay[]>
  /** Jour sélectionné (drill-down) — null = tous. */
  selectedDay: Accessor<string | null>
  onSelectDay: (day: string | null) => void
}> = (props) => {
  const charge = createMemo(() => props.charge() ?? EMPTY_CHARGE)
  const maxPalettes = createMemo(() => charge().reduce((m, c) => Math.max(m, c.palettes), 0))

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <Show
        when={charge().length > 0}
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
              event_busy
            </span>
            <span class="font-fraunces text-[14px] italic text-muted-foreground">
              Aucune réception planifiée sur la période.
            </span>
          </div>
        }
      >
        {/* Légende */}
        <div class="flex flex-none flex-wrap items-center gap-4 border-b border-rule-soft px-7 py-2 font-mono text-[10px] text-muted-foreground">
          <Legend sw={chargeBg('ok')} label="Léger (&lt; 5)" />
          <Legend sw={chargeBg('mid')} label="Moyen (5–11)" />
          <Legend sw={chargeBg('warn')} label="Fort (12–19)" />
          <Legend sw={chargeBg('bad')} label="Débord (≥ 20)" />
          <span class="ml-auto">
            Clic sur un jour pour filtrer le tableau
            <Show when={props.selectedDay()}>
              <button
                type="button"
                onClick={() => props.onSelectDay(null)}
                class="ml-2 rounded border border-rule px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand hover:bg-brand/10"
              >
                Tout afficher
              </button>
            </Show>
          </span>
        </div>

        {/* Histogramme scrollable */}
        <div class="flex-1 overflow-auto px-7 py-4">
          <div
            class="flex min-h-full items-end gap-1.5"
            style={{ 'min-width': `${Math.max(charge().length * 56, 100)}px` }}
          >
            <For each={charge()}>
              {(c) => {
                const tier = chargeTier(c.palettes)
                const heightPct =
                  maxPalettes() > 0 ? Math.max((c.palettes / maxPalettes()) * 100, 6) : 6
                const selected = props.selectedDay() === c.day
                return (
                  <button
                    type="button"
                    onClick={() => props.onSelectDay(selected ? null : c.day)}
                    class={cx(
                      'group flex min-w-[48px] flex-1 flex-col items-center justify-end rounded-md border pb-1.5 transition-colors',
                      selected
                        ? 'border-brand bg-brand/5'
                        : 'border-rule-soft hover:border-rule hover:bg-secondary/30'
                    )}
                    style={{ height: '220px' }}
                    title={`${c.dayFmt} · ${c.palettes} palette(s) · ${c.lignes} réception(s) · ${c.fournisseurs} fournisseur(s)`}
                  >
                    {/* Conteneur de charge de hauteur fixe pour éviter l'overflow */}
                    <div class="flex h-[135px] w-full flex-col justify-end items-center px-1">
                      {/* Nb palettes au-dessus de la barre */}
                      <div
                        class={cx(
                          'mb-1 font-fraunces text-[16px] font-bold tabular-nums leading-none',
                          chargeText(tier)
                        )}
                      >
                        {c.palettes}
                      </div>
                      {/* Barre */}
                      <div
                        class={cx(
                          'w-full rounded-t-sm transition-all',
                          chargeBg(tier),
                          'group-hover:opacity-90'
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    {/* Jour (relatif + JJ/MM) */}
                    <div class="mt-1.5 px-1 text-center">
                      <div
                        class={cx(
                          'font-mono text-[10px] font-bold',
                          selected ? 'text-brand' : 'text-foreground'
                        )}
                      >
                        {c.dayRelatif}
                      </div>
                      <div class="font-mono text-[9px] text-muted-foreground">{c.dayFmt}</div>
                    </div>
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  )
}

const Legend: Component<{ sw: string; label: string }> = (p) => (
  <span class="flex items-center gap-1.5">
    <span class={cx('h-[9px] w-5 rounded-[2px]', p.sw)} />
    {p.label}
  </span>
)
