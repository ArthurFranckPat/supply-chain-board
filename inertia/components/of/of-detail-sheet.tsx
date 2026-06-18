import { For, Show, createResource, type Component } from 'solid-js'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cx } from '@/libs/cva'
import type { OfDetail } from '@/lib/of/types'
import { route } from '@/lib/routes'

/**
 * Panneau de détail OF « Papier » (D3 · panneau bas). S'ouvre au clic sur une
 * carte du board ; charge le payload JSON depuis GET /api/v1/planning/ofs/:of/detail.
 *
 * Porté en Sheet side="bottom" + scope .theme-papier (le drawer se porte hors
 * du scope page, il faut donc lui ré-appliquer les tokens Papier).
 */
export const OfDetailSheet: Component<{
  num: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}> = (props) => {
  const [detail] = createResource(
    () => (props.open ? props.num : null),
    async (num) => {
      if (!num) return null
      const res = await fetch(route('scheduler.of_detail', { of: num }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as OfDetail
    },
  )

  const statusVariant = (label: string) =>
    label === 'Ferme' ? 'success' : label === 'Suggéré' ? 'warning' : 'secondary'

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        class="theme-papier gap-0 flex max-h-[72vh] w-full max-w-none flex-col rounded-t-xl p-0"
      >
        <Show
          when={detail()}
          fallback={
            <Show
              when={!detail.error}
              fallback={
                <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-destructive">
                  <span class="material-symbols-outlined text-[28px]">error</span>
                  <span class="text-sm font-medium">Échec du chargement du détail.</span>
                </div>
              }
            >
              <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                <span class="material-symbols-outlined animate-spin text-[28px]">progress_activity</span>
                <span class="text-sm">Chargement…</span>
              </div>
            </Show>
          }
        >
          {(d) => (
            <>
              {/* Barre d'identité */}
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-secondary px-5 py-3 pr-14">
                <span class="font-mono text-[13px] font-bold text-foreground">{d().num}</span>
                <Show when={d().article}>
                  <span class="font-mono text-[12px] font-bold text-terra">{d().article}</span>
                </Show>
                <SheetTitle class="font-fraunces text-[14px] font-medium italic text-muted-foreground">
                  {d().title}
                </SheetTitle>
                <Badge variant={statusVariant(d().statusLabel)} class="ml-0.5">
                  {d().statusLabel}
                </Badge>
                <Show when={d().bomBlocked > 0}>
                  <Badge variant="destructive">{d().bomBlocked} rupture(s)</Badge>
                </Show>
                <span class="flex-1" />
                <Button size="sm" variant="outline" class="gap-1.5">
                  <span class="material-symbols-outlined text-[15px]">swap_horiz</span>
                  Replanifier
                </Button>
              </div>

              {/* Méta + avancement */}
              <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule-soft px-5 py-2.5">
                <Meta k="Début" v={d().cycle.start} mono />
                <span class="material-symbols-outlined text-[15px] text-muted-foreground">arrow_forward</span>
                <Meta k="Fin" v={d().cycle.end} mono />
                <Show when={d().context}>
                  <Meta k="Poste" v={d().context} />
                </Show>
                <For each={d().stats}>{(s) => <Meta k={s.label} v={s.value} mono />}</For>
                <div class="ml-auto flex items-center gap-2">
                  <span class="font-mono text-[10px] font-semibold text-muted-foreground">Avancement</span>
                  <span class="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                    <span class="block h-full rounded-full bg-terra" style={{ width: `${d().progressPct}%` }} />
                  </span>
                  <span class="font-mono text-[11px] font-bold text-foreground">{d().progressPct}%</span>
                </div>
              </div>

              {/* BOM (composants MFGMAT + faisabilité) */}
              <div class="flex-1 overflow-auto px-5 py-3">
                <div class="mb-2 flex items-center justify-between">
                  <h3 class="font-fraunces text-[14px] font-bold tracking-tight">Composants</h3>
                  <span class="font-mono text-[11px] text-muted-foreground">{d().bomCount} articles</span>
                </div>

                <Show when={d().bomBlocked === 0 && d().bom.length > 0}>
                  <div class="mb-2 flex items-center gap-2 rounded-md bg-ferme/10 px-3 py-1.5 text-[12px] font-medium text-ferme">
                    <span class="material-symbols-outlined text-[15px]">check_circle</span>
                    Tous les composants sont disponibles
                  </div>
                </Show>

                <div class="grid grid-cols-[1fr_1.7fr_72px_84px_96px] gap-3 border-b border-border bg-secondary px-3 py-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  <span>Article</span>
                  <span>Désignation</span>
                  <span class="text-right">Besoin</span>
                  <span class="text-right">Dispo</span>
                  <span class="text-right">État</span>
                </div>

                <For each={d().bom}>
                  {(row) => (
                    <div
                      class={cx(
                        'grid grid-cols-[1fr_1.7fr_72px_84px_96px] items-center gap-3 border-b border-rule-soft px-3 py-2',
                        !row.ok && 'bg-destructive/5',
                      )}
                      title={`${row.id} — ${row.name}`}
                    >
                      <span class="truncate font-mono text-[12px] font-bold text-foreground">{row.id}</span>
                      <span class="truncate text-[12px] text-foreground/80">{row.name}</span>
                      <span class="text-right font-mono text-[12px] text-foreground">
                        {row.need} {row.unit}
                      </span>
                      <span class="text-right font-mono text-[12px] text-muted-foreground">{row.stock}</span>
                      <span class="text-right">
                        <Show
                          when={row.ok}
                          fallback={
                            <span class="font-mono text-[12px] font-bold text-destructive">
                              −{row.shortage}
                            </span>
                          }
                        >
                          <span class="font-bold text-ferme">✓</span>
                        </Show>
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </>
          )}
        </Show>
      </SheetContent>
    </Sheet>
  )
}

const Meta: Component<{ k: string; v: string; mono?: boolean }> = (p) => (
  <div class="flex items-baseline gap-1.5">
    <span class="font-mono text-[10px] font-semibold text-muted-foreground">{p.k}</span>
    <span class={cx('font-fraunces text-[13px] font-bold text-foreground', p.mono && 'font-mono')}>{p.v}</span>
  </div>
)

export default OfDetailSheet
