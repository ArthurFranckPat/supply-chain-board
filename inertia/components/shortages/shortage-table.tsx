import { For, Show, createSignal, type Accessor, type Component } from 'solid-js'
import { DataTable, type SortingState } from '@/components/ui/data-table'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cx } from '@/libs/cva'

/**
 * Vues du suivi des ruptures (design system « Papier », harmonisé avec /suivi).
 *
 * - `ShortageRegistre` : table éditoriale dense (R1) — une ligne par couple
 *   composant × OF bloqué, colonnes triables via le DataTable maison.
 * - `ShortageTimeline` : frise temporelle (R3) — réception couvrante ↔ date
 *   d'expédition, pour lire d'un coup le retard d'arrivée (gap hachuré) ou la marge.
 *
 * Les lignes arrivent déjà filtrées du parent (scheduler/shortages) ; le tri (registre)
 * est géré localement par le DataTable.
 */

const TH =
  'px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft'
const TH_R = TH.replace('text-left', 'text-right')
const TD = 'px-4 py-[13px] align-middle border-r border-rule-soft'

/** True si la ligne traduit un risque (sans couverture, ou réception après l'expé). */
const isLate = (r: ShortageDisplayRow) => r.verdictKey !== 'couvert'

// ───────────────────────────────────────────────────────────────────────────
// R1 · Registre
// ───────────────────────────────────────────────────────────────────────────

export const ShortageRegistre: Component<{
  rows: Accessor<ShortageDisplayRow[]>
  onSelectOf: (numOf: string) => void
  emptyState: import('solid-js').JSX.Element
}> = (props) => {
  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'dateExpedition', desc: false }])

  const columns = [
    {
      accessorKey: 'component',
      header: () => 'Composant · Désignation',
      cell: (info: { row: { original: ShortageDisplayRow } }) => (
        <>
          <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">{info.row.original.component}</div>
          <div class="mt-0.5 truncate max-w-[18rem] font-sans text-[12px] font-medium leading-snug text-secondary-foreground">
            {info.row.original.componentDesc}
          </div>
        </>
      ),
      meta: { thClass: TH, tdClass: TD },
    },
    {
      accessorKey: 'qteManquante',
      header: () => 'Qté manq.',
      cell: (info: { row: { original: ShortageDisplayRow } }) => (
        <>
          <span class="font-fraunces text-[19px] font-black leading-none tracking-tight text-destructive">
            {info.row.original.qteManquante}
          </span>
          <span class="ml-0.5 font-mono text-[10px] font-medium text-muted-foreground/80">u</span>
        </>
      ),
      meta: { thClass: `w-[96px] ${TH_R}`, tdClass: `w-[96px] whitespace-nowrap text-right ${TD}` },
    },
    {
      accessorKey: 'numOf',
      header: () => 'OF bloqué · PF',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <>
            <button
              type="button"
              onClick={() => props.onSelectOf(row.numOf)}
              class="cursor-pointer font-mono text-[13px] font-bold text-terra hover:underline"
            >
              {row.numOf}
            </button>
            <div class="mt-0.5 truncate max-w-[11rem] font-mono text-[10.5px] font-medium text-muted-foreground">
              {row.articleParent} · {row.articleParentDesc}
            </div>
          </>
        )
      },
      meta: { thClass: `w-[180px] ${TH}`, tdClass: `w-[180px] ${TD}` },
    },
    {
      accessorKey: 'numCommande',
      header: () => 'Commande · Client',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <Show when={row.hasCommande} fallback={<span class="font-sans text-[12px] italic text-muted-foreground/60">— OF orphelin</span>}>
            <div class="font-mono text-[13px] font-bold text-foreground">{row.numCommande}</div>
            <div class="mt-0.5 truncate max-w-[11rem] font-sans text-[12px] font-medium leading-snug text-secondary-foreground">{row.client}</div>
          </Show>
        )
      },
      meta: { thClass: `w-[185px] ${TH}`, tdClass: `w-[185px] ${TD}` },
    },
    {
      accessorKey: 'dateExpedition',
      header: () => 'Expé',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <span classList={{ 'font-bold text-destructive': isLate(row), 'text-foreground': !isLate(row) }}>
            {row.dateExpedition || '—'}
          </span>
        )
      },
      meta: {
        thClass: `w-[80px] ${TH}`,
        tdClass: `w-[80px] whitespace-nowrap font-mono text-[12.5px] font-semibold ${TD}`,
      },
    },
    {
      id: 'reception',
      enableSorting: false,
      header: () => 'Réception attendue',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const rec = info.row.original.reception
        return (
          <Show
            when={rec}
            fallback={
              <span class="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-destructive">
                <span class="material-symbols-outlined text-[13px]">block</span> Aucune réception
              </span>
            }
          >
            {(r) => (
              <>
                <div class="font-mono text-[12.5px] font-bold text-foreground">{r().id}</div>
                <div class="mt-0.5 truncate max-w-[16rem] font-mono text-[10.5px] font-medium text-muted-foreground">
                  {r().supplier} · {r().qty} u
                </div>
              </>
            )}
          </Show>
        )
      },
      meta: { thClass: TH, tdClass: TD },
    },
    {
      accessorKey: 'dateArrivee',
      header: () => 'Arrivée',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        return (
          <Show when={row.dateArrivee} fallback={<span class="text-muted-foreground/60">—</span>}>
            <span
              class="inline-flex items-center gap-1"
              classList={{ 'font-bold text-destructive': row.arriveeLate, 'text-secondary-foreground': !row.arriveeLate }}
            >
              <Show when={row.arriveeLate}>
                <span class="material-symbols-outlined text-[13px]">warning</span>
              </Show>
              {row.dateArrivee}
            </span>
          </Show>
        )
      },
      meta: {
        thClass: `w-[92px] ${TH}`,
        tdClass: `w-[92px] whitespace-nowrap font-mono text-[12.5px] font-semibold ${TD}`,
      },
    },
    {
      id: 'verdict',
      enableSorting: false,
      header: () => 'Verdict',
      cell: (info: { row: { original: ShortageDisplayRow } }) => {
        const row = info.row.original
        const tone =
          row.verdictKey === 'couvert'
            ? 'bg-ferme/15 text-ferme'
            : row.verdictKey === 'retard'
              ? 'bg-suggere/15 text-suggere'
              : 'bg-destructive/10 text-destructive'
        return (
          <span class={cx('inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', tone)}>
            <span class="material-symbols-outlined text-[13px]">{row.verdictIcon}</span>
            {row.verdictLabel}
          </span>
        )
      },
      meta: { thClass: `w-[150px] ${TH.replace('border-r border-rule-soft', '')}`, tdClass: `w-[150px] px-4 py-[13px] align-middle` },
    },
  ]

  const indexColumn = {
    headerLabel: 'N°',
    thClass: `w-[38px] ${TH}`,
    tdClass: (row: ShortageDisplayRow) =>
      cx(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]',
      ),
  }

  return (
    <DataTable
      columns={columns}
      rows={props.rows}
      sorting={sorting}
      onSortingChange={setSorting}
      indexColumn={indexColumn}
      tableClass="min-w-[1180px] text-xs"
      scrollContainerClass="h-full border-0 rounded-none shadow-none"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowClass={(row) =>
        cx(
          'border-t border-rule-soft transition-colors',
          isLate(row) ? 'bg-destructive/10 hover:bg-destructive/[0.18]' : 'hover:bg-foreground/[0.04]',
        )
      }
      emptyState={props.emptyState}
    />
  )
}

// ───────────────────────────────────────────────────────────────────────────
// R3 · Couverture (frise temporelle)
// ───────────────────────────────────────────────────────────────────────────

/** Position en % d'une date ISO dans la fenêtre [start, start+horizon j], clampée 0..100. */
const offsetPct = (iso: string | null, startIso: string, horizon: number): number | null => {
  if (!iso) return null
  const a = Date.parse(`${startIso}T00:00:00Z`)
  const b = Date.parse(`${iso}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b) || horizon <= 0) return null
  const days = (b - a) / 86_400_000
  return Math.max(0, Math.min(100, (days / horizon) * 100))
}

export const ShortageTimeline: Component<{
  rows: ShortageDisplayRow[]
  windowStartIso: string
  horizon: number
  onSelectOf: (numOf: string) => void
  emptyState: import('solid-js').JSX.Element
}> = (props) => {
  // Repères de semaine (lundis) sur la fenêtre — uniquement pour la grille de fond.
  const weekTicks = () => {
    const ticks: { pct: number; label: string }[] = []
    const start = new Date(`${props.windowStartIso}T00:00:00Z`)
    for (let d = 0; d <= props.horizon; d++) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + d)
      if (day.getUTCDay() === 1) {
        // Lundi → numéro de semaine ISO approximatif (affichage seulement).
        const jan1 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
        const wk = Math.ceil(((day.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7)
        ticks.push({ pct: (d / props.horizon) * 100, label: `S${wk}` })
      }
    }
    return ticks
  }

  const todayPct = () => offsetPct(new Date().toISOString().slice(0, 10), props.windowStartIso, props.horizon)

  return (
    <div class="h-full overflow-auto rounded-none border-0 bg-card">
      <Show when={props.rows.length > 0} fallback={props.emptyState}>
        <div class="min-w-[980px]">
          <For each={props.rows}>
            {(row) => {
              const expPct = () => offsetPct(row.dateExpeditionIso, props.windowStartIso, props.horizon)
              const recPct = () => offsetPct(row.receptionIso, props.windowStartIso, props.horizon)
              const gap = () => {
                const e = expPct()
                const r = recPct()
                if (e === null || r === null) return null
                return { left: Math.min(e, r), width: Math.abs(r - e), bad: row.arriveeLate }
              }
              return (
                <div
                  class={cx(
                    'grid grid-cols-[330px_1fr] border-b border-rule-soft transition-colors',
                    isLate(row) ? 'bg-destructive/10 hover:bg-destructive/[0.18]' : 'hover:bg-foreground/[0.04]',
                  )}
                >
                  {/* Contexte */}
                  <div
                    class={cx(
                      'flex flex-col gap-0.5 border-r border-rule-soft px-4 py-[13px]',
                      isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]',
                    )}
                  >
                    <div class="flex items-baseline gap-2">
                      <span class="font-mono text-[13px] font-bold text-foreground">{row.component}</span>
                      <span class="ml-auto font-mono text-[11px] font-bold text-destructive">−{row.qteManquante} u</span>
                    </div>
                    <div class="truncate font-sans text-[11.5px] font-medium text-secondary-foreground">{row.componentDesc}</div>
                    <div class="mt-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                      <button type="button" onClick={() => props.onSelectOf(row.numOf)} class="cursor-pointer font-bold text-terra hover:underline">
                        {row.numOf}
                      </button>
                      {' · '}
                      {row.hasCommande ? `${row.numCommande} · ${row.client}` : 'OF orphelin'}
                    </div>
                  </div>

                  {/* Frise */}
                  <div class="relative mx-3.5 my-2.5 h-[46px]">
                    {/* Grille semaines */}
                    <For each={weekTicks()}>
                      {(t) => (
                        <div class="absolute bottom-4 top-0 w-px bg-hair" style={{ left: `${t.pct}%` }}>
                          <span class="absolute -top-0.5 left-1 font-mono text-[8px] font-bold tracking-wide text-muted-foreground/70">{t.label}</span>
                        </div>
                      )}
                    </For>
                    {/* Axe */}
                    <div class="absolute left-0 right-0 top-6 h-0.5 bg-rule-soft" />
                    {/* Aujourd'hui */}
                    <Show when={todayPct() !== null}>
                      <div class="absolute bottom-3.5 top-0 w-0.5 bg-terra/50" style={{ left: `${todayPct()}%` }}>
                        <span class="absolute -top-0.5 left-1 font-mono text-[8px] font-bold text-terra">auj.</span>
                      </div>
                    </Show>
                    {/* Gap réception ↔ expé */}
                    <Show when={gap()}>
                      {(g) => (
                        <div
                          class={cx(
                            'absolute top-[21px] h-2 rounded-full border',
                            g().bad
                              ? 'border-destructive/35 [background:repeating-linear-gradient(45deg,var(--color-destructive)/10,var(--color-destructive)/10_5px,transparent_5px,transparent_10px)]'
                              : 'border-ferme/30 bg-ferme/15',
                          )}
                          style={{ left: `${g().left}%`, width: `${g().width}%` }}
                        />
                      )}
                    </Show>
                    {/* Marqueur expé */}
                    <Show when={expPct() !== null}>
                      <Marker pct={expPct()!} tone="exp" cap={`expé ${row.dateExpedition}`} />
                    </Show>
                    {/* Marqueur réception (ou absence) */}
                    <Show
                      when={row.receptionIso}
                      fallback={<Marker pct={88} tone="none" cap="aucune réception" sub="à commander" dashed />}
                    >
                      <Marker
                        pct={recPct()!}
                        tone={row.arriveeLate ? 'bad' : 'ok'}
                        cap={`arr. ${row.dateArrivee}`}
                        sub={row.arriveeLate ? `+${row.joursRetardReception} j · ${row.reception?.id ?? ''}` : (row.reception?.id ?? '')}
                      />
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>

          {/* Légende */}
          <div class="flex flex-wrap gap-4 border-t border-rule-soft bg-card px-4 py-2.5 font-mono text-[10px] font-semibold text-muted-foreground">
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-terra" /> Date d'expédition (cible)</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-ferme" /> Réception à temps</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-destructive" /> Réception en retard</span>
            <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full border-2 border-dashed border-destructive" /> Aucune réception</span>
          </div>
        </div>
      </Show>
    </div>
  )
}

/** Marqueur de frise (pastille + libellé + sous-libellé), positionné en %. */
const Marker: Component<{ pct: number; tone: 'exp' | 'ok' | 'bad' | 'none'; cap: string; sub?: string; dashed?: boolean }> = (
  p,
) => {
  const pinCls =
    p.tone === 'exp'
      ? 'bg-terra'
      : p.tone === 'ok'
        ? 'bg-ferme'
        : p.tone === 'bad'
          ? 'bg-destructive'
          : 'border-2 border-dashed border-destructive'
  const capCls = p.tone === 'exp' ? 'text-terra' : p.tone === 'ok' ? 'text-ferme' : 'text-destructive'
  return (
    <div class="absolute top-3.5 flex -translate-x-1/2 flex-col items-center gap-0.5" style={{ left: `${p.pct}%` }}>
      <span class={cx('size-[13px] rounded-full border-2 border-card', pinCls)} />
      <span class={cx('mt-0.5 whitespace-nowrap font-mono text-[9px] font-bold', capCls)}>{p.cap}</span>
      <Show when={p.sub}>
        <span class="whitespace-nowrap font-mono text-[8px] font-medium text-muted-foreground">{p.sub}</span>
      </Show>
    </div>
  )
}
