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
import type { OrderLineDetail } from '@/lib/orders/types'
import { cn } from '@/libs/cn'
import { route } from '@/lib/routes'

/**
 * Drawer de détail d'une ligne de commande (vue planification). S'ouvre au clic sur une
 * carte ; charge le payload JSON depuis GET /api/v1/planning/order-lines/:order/:line.
 * `lineId` = `numCommande#ligne` (clé de la carte).
 */
export const OrderDetailSheet: Component<{
  lineId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}> = (props) => {
  const [detail] = createResource(
    () => (props.open ? props.lineId : null),
    async (id) => {
      if (!id) return null
      const [num, ligne] = id.split('#')
      const res = await fetch(route('order_planning.line_detail', { order: num, line: ligne }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as OrderLineDetail
    }
  )

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
                <span class="material-symbols-outlined text-[28px] animate-spin">
                  progress_activity
                </span>
                <span class="text-sm">Chargement…</span>
              </div>
            </Show>
          }
        >
          {(d) => (
            <>
              <SheetHeader>
                <div class="flex items-center gap-2 pr-8 flex-wrap">
                  <span class="mono text-[11px] font-semibold tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {d().numCommande} · L{d().ligne}
                  </span>
                  <span class="mono text-[11px] text-primary bg-m3-primary/5 px-1.5 py-0.5 rounded">
                    {d().article}
                  </span>
                  <div class="ml-auto flex items-center gap-1.5">
                    <Show when={d().orderType}>
                      <Badge variant="secondary" class="uppercase tracking-wider text-[10px]">
                        {d().orderType}
                      </Badge>
                    </Show>
                    <Show when={d().hasOverride}>
                      <Badge variant="warning" class="uppercase tracking-wider text-[10px] gap-1">
                        <span class="material-symbols-outlined text-[12px]">edit_calendar</span>{' '}
                        Override
                      </Badge>
                    </Show>
                  </div>
                </div>

                <SheetTitle>{d().designation ?? d().article}</SheetTitle>
                <SheetDescription>
                  {d().workstationLabel ?? 'Poste non assigné'} · {d().nature}
                </SheetDescription>
              </SheetHeader>

              <SheetBody>
                {/* Stats — grille 3 colonnes */}
                <div class="grid grid-cols-3 gap-2">
                  <Stat
                    label="Quantité"
                    value={`${d().quantite}${d().unite ? ' ' + d().unite : ''}`}
                  />
                  <Stat
                    label="Échéance"
                    value={d().dateLivraison}
                    valueClass={d().hasOverride ? 'text-amber-600' : ''}
                  />
                  <Stat label="Charge" value={`${d().hours} h`} />
                  <Stat label="Poste" value={d().workstation ?? '—'} />
                  <Stat label="Client" value={d().client ?? '—'} />
                  <Stat label="Contremarque" value={d().contremarque ?? '—'} />
                </div>

                {/* BOM (composants directs + faisabilité) */}
                <section>
                  <div class="flex items-center justify-between mb-2">
                    <h3 class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Composants
                    </h3>
                    <span class="mono text-[10px] text-muted-foreground">
                      {d().bomCount} articles
                    </span>
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

                  <Show
                    when={d().bom.length > 0}
                    fallback={
                      <div class="text-xs text-muted-foreground italic px-1 py-2">
                        Aucune nomenclature pour cet article.
                      </div>
                    }
                  >
                    <div class="space-y-1">
                      <For each={d().bom}>
                        {(row) => (
                          <div
                            class="grid grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
                            classList={{
                              'border-destructive/40 bg-destructive/5': !row.ok,
                              'border-border': row.ok,
                            }}
                            title={`${row.article} — ${row.description}`}
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
                              <div class="mono text-[11px] font-semibold text-foreground truncate">
                                {row.article}
                              </div>
                              <div class="text-[10px] text-muted-foreground truncate">
                                {row.description}
                              </div>
                            </div>
                            <div class="text-right">
                              <div class="mono text-[11px] font-semibold text-foreground whitespace-nowrap">
                                {row.need} {row.unit}
                              </div>
                              <Show
                                when={row.shortage}
                                fallback={
                                  <div class="mono text-[10px] text-muted-foreground whitespace-nowrap">
                                    stock {row.available}
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
                  </Show>
                </section>
              </SheetBody>
            </>
          )}
        </Show>
      </SheetContent>
    </Sheet>
  )
}

const Stat: Component<{ label: string; value: string; valueClass?: string }> = (props) => (
  <div class="rounded-lg border border-border bg-card px-3 py-2.5">
    <div class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground truncate">
      {props.label}
    </div>
    <div class={cn('mt-1 text-sm font-bold mono leading-tight truncate', props.valueClass)}>
      {props.value}
    </div>
  </div>
)

export default OrderDetailSheet
