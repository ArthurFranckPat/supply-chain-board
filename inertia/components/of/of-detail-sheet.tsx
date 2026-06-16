import { For, Show, createResource, type Component } from 'solid-js'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import type { OfDetail } from '@/lib/of/types'
import { cn } from '@/libs/cn'

/**
 * Drawer de détail OF. S'ouvre au clic sur une carte du board ; charge le
 * payload JSON depuis GET /scheduler/of/:num (createResource).
 *
 * Remplace l'ancienne page dédiée /scheduler/of/:num (of_detail.edge) par un
 * panneau contextuel — on ne quitte plus le board.
 */
export const OfDetailSheet: Component<{
  num: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}> = (props) => {
  const [detail] = createResource(
    () => props.num,
    async (num) => {
      if (!num) return null
      const res = await fetch(`/scheduler/of/${encodeURIComponent(num)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as OfDetail
    }
  )

  const statusVariant = (label: string) =>
    label === 'Ferme' ? 'success' : label === 'Suggéré' ? 'warning' : 'secondary'

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent>
        <Show when={detail()}>
          {(d) => (
            <>
              <SheetHeader>
                <div class="flex items-center gap-2">
                  <span class="mono text-[12px] font-semibold tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {d().num}
                  </span>
                  <Show when={d().article}>
                    <span class="mono text-[11px] tracking-wide text-primary bg-m3-primary/5 px-2 py-0.5 rounded">
                      {d().article}
                    </span>
                  </Show>
                  <Badge variant={statusVariant(d().statusLabel)} class="ml-auto uppercase tracking-wider">
                    {d().statusLabel}
                  </Badge>
                </div>
                <SheetTitle>{d().title}</SheetTitle>
                <SheetDescription>{d().context || 'Poste non assigné'}</SheetDescription>

                {/* Progression */}
                <div class="mt-2">
                  <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    <span>Avancement</span>
                    <span>{d().progressPct}%</span>
                  </div>
                  <div class="h-2 bg-muted rounded-full overflow-hidden">
                    <div class="h-full bg-primary" style={{ width: `${d().progressPct}%` }} />
                  </div>
                </div>
              </SheetHeader>

              <SheetBody>
                {/* Stats */}
                <Show when={d().stats.length > 0}>
                  <div class="grid grid-cols-2 gap-2">
                    <For each={d().stats}>
                      {(s) => (
                        <div class="rounded-md border border-border bg-card p-3">
                          <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {s.label}
                          </div>
                          <div class={cn('mt-1 text-lg font-bold mono', s.valueClass)}>{s.value}</div>
                          <Show when={s.sub}>
                            <div class="text-[10px] text-muted-foreground">{s.sub}</div>
                          </Show>
                          <Show when={s.trend}>
                            <div class={cn('text-[10px] font-bold mt-0.5', s.trendClass)}>{s.trend}</div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Cycle */}
                <div class="rounded-md border border-border bg-card p-3 flex items-center justify-between">
                  <div>
                    <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Début
                    </div>
                    <div class="mono text-[12px] font-semibold text-foreground">{d().cycle.start}</div>
                  </div>
                  <span class="material-symbols-outlined text-muted-foreground">arrow_forward</span>
                  <div class="text-right">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Fin
                    </div>
                    <div class="mono text-[12px] font-semibold text-foreground">{d().cycle.end}</div>
                  </div>
                </div>

                {/* BOM (composants MFGMAT + faisabilité) */}
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Composants
                    </span>
                    <span class="mono text-[10px] text-muted-foreground">{d().bomCount} articles</span>
                  </div>
                  <Show
                    when={d().bomBlocked > 0}
                    fallback={
                      <Show when={d().bom.length > 0}>
                        <div class="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-xs font-medium">
                          ✓ Tous les composants sont disponibles
                        </div>
                      </Show>
                    }
                  >
                    <div class="rounded-md bg-destructive/10 border border-destructive/30 text-destructive px-3 py-2 text-xs font-medium mb-2">
                      ⚠ {d().bomBlocked} composant(s) en rupture
                    </div>
                  </Show>

                  <div class="space-y-1">
                    <For each={d().bom}>
                      {(row) => (
                        <div
                          class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                          classList={{
                            'border-destructive/40 bg-destructive/5': !row.ok,
                          }}
                        >
                          <span
                            class={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                              row.ok ? 'bg-emerald-500' : 'bg-destructive'
                            )}
                          >
                            {row.ok ? '✓' : '!'}
                          </span>
                          <div class="min-w-0 flex-1">
                            <div class="mono text-[11px] font-semibold text-foreground truncate">
                              {row.id}
                            </div>
                            <div class="text-[10px] text-muted-foreground truncate">{row.name}</div>
                          </div>
                          <div class="text-right shrink-0">
                            <div class="mono text-[11px] font-semibold text-foreground">
                              {row.need} {row.unit}
                            </div>
                            <div class="mono text-[10px] text-muted-foreground">
                              stock {row.stock} {row.unit}
                            </div>
                          </div>
                          <Show when={row.shortage}>
                            <span class="mono text-[10px] font-bold text-destructive shrink-0">
                              {row.shortage} {row.unit}
                            </span>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </SheetBody>
            </>
          )}
        </Show>

        {/* États chargement / erreur */}
        <Show when={detail.loading && !detail()}>
          <div class="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <span class="material-symbols-outlined animate-spin mr-2">progress_activity</span>
            Chargement…
          </div>
        </Show>
        <Show when={detail.error}>
          <div class="flex-1 flex items-center justify-center text-destructive text-sm p-6 text-center">
            Échec du chargement du détail.
          </div>
        </Show>
      </SheetContent>
    </Sheet>
  )
}

export default OfDetailSheet
