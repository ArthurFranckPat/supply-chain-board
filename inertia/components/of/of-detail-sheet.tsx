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
        <Show
          when={detail()}
          fallback={
            <Show
              when={!detail.error}
              fallback={
                <div class="flex-1 flex flex-col items-center justify-center gap-2 text-destructive p-8 text-center">
                  <span class="material-symbols-outlined text-[28px]">error</span>
                  <span class="text-sm font-medium">Échec du chargement du détail.</span>
                </div>
              }
            >
              <div class="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground p-8">
                <span class="material-symbols-outlined text-[28px] animate-spin">progress_activity</span>
                <span class="text-sm">Chargement…</span>
              </div>
            </Show>
          }
        >
          {(d) => (
            <>
              <SheetHeader>
                {/* Ligne identité : num + article + statut */}
                <div class="flex items-center gap-2 pr-8 flex-wrap">
                  <span class="mono text-[11px] font-semibold tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {d().num}
                  </span>
                  <Show when={d().article}>
                    <span class="mono text-[11px] text-primary bg-m3-primary/5 px-1.5 py-0.5 rounded">
                      {d().article}
                    </span>
                  </Show>
                  <Badge
                    variant={statusVariant(d().statusLabel)}
                    class="ml-auto uppercase tracking-wider text-[10px]"
                  >
                    {d().statusLabel}
                  </Badge>
                </div>

                <SheetTitle>{d().title}</SheetTitle>
                <SheetDescription>{d().context || 'Poste non assigné'}</SheetDescription>

                {/* Progression */}
                <div class="mt-1">
                  <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                    <span>Avancement</span>
                    <span class="text-foreground">{d().progressPct}%</span>
                  </div>
                  <div class="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div class="h-full bg-primary transition-all" style={{ width: `${d().progressPct}%` }} />
                  </div>
                </div>
              </SheetHeader>

              <SheetBody>
                {/* Stats — grille 3 colonnes homogène */}
                <Show when={d().stats.length > 0}>
                  <div class="grid grid-cols-3 gap-2">
                    <For each={d().stats}>
                      {(s) => (
                        <div class="rounded-lg border border-border bg-card px-3 py-2.5">
                          <div class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                            {s.label}
                          </div>
                          <div class={cn('mt-1 text-base font-bold mono leading-none', s.valueClass)}>
                            {s.value}
                          </div>
                          <Show when={s.sub}>
                            <div class="text-[10px] text-muted-foreground mt-1 truncate">{s.sub}</div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Cycle */}
                <div class="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center gap-3">
                  <div class="flex-1">
                    <div class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Début
                    </div>
                    <div class="mono text-xs font-semibold text-foreground">{d().cycle.start}</div>
                  </div>
                  <span class="material-symbols-outlined text-muted-foreground text-[18px]">
                    arrow_forward
                  </span>
                  <div class="flex-1 text-right">
                    <div class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Fin
                    </div>
                    <div class="mono text-xs font-semibold text-foreground">{d().cycle.end}</div>
                  </div>
                </div>

                {/* BOM (composants MFGMAT + faisabilité) */}
                <section>
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Composants
                    </h3>
                    <span class="mono text-[10px] text-muted-foreground">{d().bomCount} articles</span>
                  </div>

                  <Show
                    when={d().bomBlocked > 0}
                    fallback={
                      <Show when={d().bom.length > 0}>
                        <div class="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-2 text-xs font-medium mb-2">
                          <span class="material-symbols-outlined text-[16px]">check_circle</span>
                          Tous les composants sont disponibles
                        </div>
                      </Show>
                    }
                  >
                    <div class="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/40 text-destructive px-3 py-2 text-xs font-semibold mb-2">
                      <span class="material-symbols-outlined text-[16px]">error</span>
                      {d().bomBlocked} composant(s) en rupture
                    </div>
                  </Show>

                  <div class="space-y-1">
                    <For each={d().bom}>
                      {(row) => (
                        <div
                          class="grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
                          classList={{
                            'border-destructive/40 bg-destructive/5': !row.ok,
                            'border-border': row.ok,
                          }}
                          title={`${row.id} — ${row.name}`}
                        >
                          <span
                            class={cn(
                              'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white',
                              row.ok ? 'bg-emerald-500' : 'bg-destructive'
                            )}
                          >
                            {row.ok ? '✓' : '!'}
                          </span>
                          <div class="min-w-0">
                            <div class="mono text-[11px] font-semibold text-foreground truncate">{row.id}</div>
                            <div class="text-[10px] text-muted-foreground truncate">{row.name}</div>
                          </div>
                          <div class="text-right">
                            <div class="mono text-[11px] font-semibold text-foreground whitespace-nowrap">
                              {row.need} {row.unit}
                            </div>
                            <Show
                              when={row.shortage}
                              fallback={
                                <div class="mono text-[10px] text-muted-foreground whitespace-nowrap">
                                  stock {row.stock}
                                </div>
                              }
                            >
                              <div class="mono text-[10px] font-bold text-destructive whitespace-nowrap">
                                −{row.shortage} {row.unit}
                              </div>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </SheetBody>
            </>
          )}
        </Show>
      </SheetContent>
    </Sheet>
  )
}

export default OfDetailSheet
