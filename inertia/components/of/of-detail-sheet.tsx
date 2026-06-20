import { For, Show, createResource, createSignal, createEffect, type Component } from 'solid-js'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cx } from '@/libs/cva'
import type { OfDetail } from '@/lib/of/types'
import { route } from '@/lib/routes'

// ---------------------------------------------------------------------------
// Types diagnostic (miroir de RecursiveDiagnosticResult côté serveur)
// ---------------------------------------------------------------------------

type NodeStatus = 'ok' | 'qc_a_controler' | 'rupture_matiere' | 'sous_ensemble_a_lancer' | 'indetermine'
type NodeSource = 'MFGMAT' | 'NOMENCLATURE'

interface DiagNode {
  numOf: string
  article: string
  description: string
  statut: number
  source: NodeSource
  feasible: boolean
  status: NodeStatus
  shorts: DiagShort[]
  alerts: string[]
}
interface DiagShort {
  article: string
  description: string
  quantityNeeded: number
  available: number | null
  stockQc?: number
  quantityMissing: number
  earliestReception: string | null
  receptionSupplier?: string
  receptionOrderId?: string
  fabricated: boolean
  covering: DiagCovering[]
  status: NodeStatus
}
interface DiagCovering {
  numOf: string
  statut: number
  quantity: number
  node: DiagNode
}
interface DiagResult {
  numOf: string
  article: string
  feasible: boolean
  rootCause: NodeStatus
  tree: DiagNode
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
}

// ---------------------------------------------------------------------------
// Helpers statut
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<NodeStatus, string> = {
  ok: 'OK',
  qc_a_controler: 'Contrôle qualité',
  rupture_matiere: 'Rupture matière',
  sous_ensemble_a_lancer: 'Sous-ensemble à lancer',
  indetermine: 'Indéterminé',
}
type BadgeVariant = 'success' | 'destructive' | 'warning' | 'secondary'
const STATUS_VARIANT: Record<NodeStatus, BadgeVariant> = {
  ok: 'success',
  qc_a_controler: 'warning',
  rupture_matiere: 'destructive',
  sous_ensemble_a_lancer: 'warning',
  indetermine: 'secondary',
}
const STATUT_OF: Record<number, string> = { 1: 'ferme', 2: 'planifié', 3: 'suggéré' }

const StatusBadge: Component<{ status: NodeStatus; class?: string }> = (p) => (
  <Badge variant={STATUS_VARIANT[p.status]} class={p.class}>
    {STATUS_LABEL[p.status]}
  </Badge>
)

// ---------------------------------------------------------------------------
// Arbre diagnostic — layout tabulaire aligné
// ---------------------------------------------------------------------------

/** ISO YYYY-MM-DD → JJ/MM/AA */
function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}

/** Labels courts pour les badges dans l'arbre (espace limité). */
const TREE_STATUS_LABEL: Record<NodeStatus, string> = {
  ok: 'OK',
  qc_a_controler: 'CQ requis',
  rupture_matiere: 'Rupture',
  sous_ensemble_a_lancer: 'À lancer',
  indetermine: '?',
}

/**
 * En-tête de colonnes du tableau diagnostic.
 * Colonnes : [statut 6.5rem] [article 6rem] [description 1fr] [besoin 3rem] [dispo 3rem] [manque 4rem] [réception 6.5rem]
 */
const DiagColHeader: Component = () => (
  <div class="flex items-center gap-3 border-b border-border bg-secondary px-3 py-1 font-mono text-[8px] font-bold tracking-wider text-muted-foreground">
    <span class="w-[6.5rem] flex-none">Statut</span>
    <span class="w-[6rem] flex-none">Article</span>
    <span class="min-w-0 flex-1">Désignation</span>
    <span class="w-9 flex-none text-right">Besoin</span>
    <span class="w-9 flex-none text-right">Dispo</span>
    <span class="w-10 flex-none text-right">Manque</span>
    <span class="w-[13rem] flex-none">Réception prévue</span>
  </div>
)

/** Une ligne composant (achetée ou sous-ensemble) dans le tableau. */
const DiagRow: Component<{ short: DiagShort }> = (p) => (
  <div
    class={cx(
      'flex items-center gap-3 px-3 py-2',
      p.short.status === 'rupture_matiere' && 'bg-destructive/10',
      p.short.status === 'qc_a_controler' && 'bg-warning/10',
    )}
  >
    <div class="w-[6.5rem] flex-none">
      <Badge variant={STATUS_VARIANT[p.short.status]} class="whitespace-nowrap text-[8px]">
        {TREE_STATUS_LABEL[p.short.status]}
      </Badge>
    </div>
    <span class={cx('w-[6rem] flex-none truncate font-mono text-[11px] font-bold',
      p.short.status === 'rupture_matiere' ? 'text-destructive' : 'text-foreground'
    )}>
      {p.short.article}
    </span>
    <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
      {p.short.description}
    </span>
    <span class="w-9 flex-none text-right font-mono text-[11px] text-muted-foreground">
      {p.short.quantityNeeded}
    </span>
    <span class="w-9 flex-none text-right font-mono text-[11px] text-muted-foreground">
      <Show when={p.short.stockQc} fallback={<>{p.short.available ?? '?'}</>}>
        <span class="font-semibold text-warning" title={`dont ${p.short.stockQc} en CQ`}>
          {p.short.available ?? 0}+{p.short.stockQc}
        </span>
      </Show>
    </span>
    <span class="w-10 flex-none text-right font-mono text-[11px] font-bold text-destructive">
      −{p.short.quantityMissing}
    </span>
    <div class="w-[13rem] flex-none font-mono text-[10px]">
      <Show when={p.short.earliestReception}>
        <div class="flex flex-col gap-0.5">
          <Show when={p.short.receptionSupplier}>
            <span class="font-semibold text-foreground truncate">{p.short.receptionSupplier}</span>
          </Show>
          <div class="flex items-center gap-1.5 text-muted-foreground">
            <Show when={p.short.receptionOrderId}>
              <span class="text-[9px] font-mono">{p.short.receptionOrderId}</span>
              <span class="text-border">·</span>
            </Show>
            <span class="text-terra">réc. {fmtDateFr(p.short.earliestReception)}</span>
          </div>
        </div>
      </Show>
      <Show when={p.short.status === 'qc_a_controler' && !p.short.earliestReception}>
        <span class="text-warning">lever CQ</span>
      </Show>
    </div>
  </div>
)

/**
 * Bloc "couvert par" — en-tête OF couvrant + ses composants récursifs.
 * Indenté sous la colonne description (après statut + article = ~12.5rem).
 */
const DiagShortRow: Component<{ short: DiagShort }> = (props) => (
  <div class="border-b border-rule-soft last:border-b-0">
    <DiagRow short={props.short} />

    <Show when={props.short.covering.length > 0}>
      <div class="ml-[12.5rem] border-l-2 border-border/40 mb-1">
        <For each={props.short.covering}>
          {(cov) => (
            <div class="pl-3 pt-0.5">
              {/* En-tête OF couvrant */}
              <div class="flex flex-wrap items-center gap-1.5 py-1 font-mono text-[9px] text-muted-foreground">
                <span class="material-symbols-outlined text-[11px]">subdirectory_arrow_right</span>
                <span class="font-semibold tracking-wider">COUVERT PAR</span>
                <span class="font-bold text-[11px] text-foreground">{cov.numOf}</span>
                <Badge
                  variant={cov.statut === 1 ? 'success' : cov.statut === 3 ? 'warning' : 'secondary'}
                  class="text-[8px]"
                >
                  {STATUT_OF[cov.statut] ?? `statut ${cov.statut}`}
                </Badge>
                <Badge
                  variant={cov.node.source === 'MFGMAT' ? 'success' : 'secondary'}
                  class="text-[8px]"
                >
                  {cov.node.source === 'MFGMAT' ? 'réel' : 'théorique'}
                </Badge>
                <span>qté {cov.quantity}</span>
                <Badge variant={STATUS_VARIANT[cov.node.status]} class="text-[8px]">
                  {TREE_STATUS_LABEL[cov.node.status]}
                </Badge>
              </div>
              {/* Composants du sous-ensemble */}
              <Show
                when={cov.node.shorts.length > 0}
                fallback={
                  <div class="pb-1 font-mono text-[10px] text-ferme">
                    ✓ tous composants disponibles
                  </div>
                }
              >
                <div class="mb-1 overflow-hidden rounded border border-border/60">
                  <For each={cov.node.shorts}>
                    {(s) => <DiagShortRow short={s} />}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  </div>
)

// ---------------------------------------------------------------------------
// Sheet principale
// ---------------------------------------------------------------------------

export const OfDetailSheet: Component<{
  num: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}> = (props) => {
  const [tab, setTab] = createSignal<'composants' | 'diagnostic'>('composants')
  // Devient true au premier clic sur "Diagnostic récursif" — déclenche le fetch une seule fois.
  const [diagRequested, setDiagRequested] = createSignal(false)

  // Réinitialise l'état quand l'OF change (nouvelle carte cliquée).
  createEffect(() => {
    props.num // track
    setTab('composants')
    setDiagRequested(false)
  })

  const [detail] = createResource(
    () => (props.open ? props.num : null),
    async (num) => {
      if (!num) return null
      const res = await fetch(route('scheduler.of_detail', { of: num }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as OfDetail
    },
  )

  // Diagnostic : lazy (diagRequested) + memoïsé pour la durée d'ouverture du sheet.
  const [diag] = createResource(
    () => (diagRequested() && props.open ? props.num : null),
    async (numOf) => {
      if (!numOf) return null
      const res = await fetch(route('planning_board.of_materials_diagnostic', { of: numOf }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as DiagResult
    },
  )

  const openDiagTab = () => {
    setDiagRequested(true)
    setTab('diagnostic')
  }

  const statusVariant = (label: string) =>
    label === 'Ferme' ? 'success' : label === 'Suggéré' ? 'warning' : 'secondary'

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        class="theme-papier gap-0 flex h-[72vh] w-full max-w-none flex-col rounded-t-xl p-0"
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

              {/* Onglets */}
              <div class="flex gap-0 border-b border-border">
                <TabBtn active={tab() === 'composants'} onClick={() => setTab('composants')}>
                  <span class="material-symbols-outlined text-[14px]">inventory_2</span>
                  Composants
                  <Show when={d().bomBlocked > 0}>
                    <span class="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-white">
                      {d().bomBlocked}
                    </span>
                  </Show>
                </TabBtn>
                <TabBtn active={tab() === 'diagnostic'} onClick={openDiagTab}>
                  <span class="material-symbols-outlined text-[14px]">account_tree</span>
                  Diagnostic récursif
                </TabBtn>
              </div>

              {/* Contenu onglets */}
              <div class="flex-1 overflow-auto px-5 py-3">
                <Show when={tab() === 'composants'}>
                  {/* Récap ruptures en haut — visible sans scroll */}
                  <Show when={d().bomBlocked > 0}>
                    <div class="mb-3 rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2.5">
                      <div class="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-wider text-destructive">
                        <span class="material-symbols-outlined text-[14px]">warning</span>
                        {d().bomBlocked} COMPOSANT{d().bomBlocked > 1 ? 'S' : ''} EN RUPTURE
                      </div>
                      <div class="flex flex-wrap gap-1.5">
                        <For each={d().bom.filter((r) => !r.ok)}>
                          {(row) => (
                            <span class="inline-flex items-baseline gap-1 rounded border border-destructive/30 bg-background px-2 py-0.5 font-mono text-[11px]">
                              <span class="font-bold text-foreground">{row.id}</span>
                              <span class="text-destructive font-semibold">−{row.shortage}</span>
                            </span>
                          )}
                        </For>
                      </div>
                    </div>
                  </Show>

                  {/* En-tête table */}
                  <div class="mb-1 flex items-center justify-between">
                    <Show when={d().bomBlocked === 0 && d().bom.length > 0}>
                      <div class="flex items-center gap-2 rounded-md bg-ferme/10 px-3 py-1.5 text-[12px] font-medium text-ferme">
                        <span class="material-symbols-outlined text-[15px]">check_circle</span>
                        Tous les composants sont disponibles
                      </div>
                    </Show>
                    <span class="ml-auto font-mono text-[11px] text-muted-foreground">{d().bomCount} articles</span>
                  </div>

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
                          'grid grid-cols-[1fr_1.7fr_72px_84px_96px] items-center gap-3 border-b px-3 py-2',
                          row.ok
                            ? 'border-rule-soft'
                            : 'border-destructive/20 bg-destructive/10 border-l-2 border-l-destructive',
                        )}
                        title={`${row.id} — ${row.name}`}
                      >
                        <span class={cx('truncate font-mono text-[12px] font-bold', row.ok ? 'text-foreground' : 'text-destructive')}>
                          {row.id}
                        </span>
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
                </Show>

                <Show when={tab() === 'diagnostic'}>
                  <Show
                    when={!diag.loading}
                    fallback={
                      <div class="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                        <span class="material-symbols-outlined animate-spin text-[24px]">progress_activity</span>
                        <span class="text-[12px]">Diagnostic en cours…</span>
                      </div>
                    }
                  >
                    <Show
                      when={!diag.error}
                      fallback={
                        <div class="flex flex-col items-center gap-2 py-8 text-destructive">
                          <span class="material-symbols-outlined text-[22px]">error</span>
                          <span class="text-[12px] font-medium">{(diag.error as Error)?.message}</span>
                        </div>
                      }
                    >
                      <Show when={diag()}>
                        {(dr) => (
                          <div class="flex flex-col gap-3">
                            <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
                              <StatusBadge status={dr().rootCause} />
                              <Badge
                                variant={
                                  dr().feasible
                                    ? 'success'
                                    : dr().rootCause === 'qc_a_controler'
                                      ? 'warning'
                                      : 'destructive'
                                }
                              >
                                {dr().feasible
                                  ? 'Faisable'
                                  : dr().rootCause === 'qc_a_controler'
                                    ? 'Faisable sous réserve CQ'
                                    : 'Bloqué'}
                              </Badge>
                              <span class="ml-auto font-mono text-[10px] text-muted-foreground">
                                {dr().componentsChecked} composant(s) · profondeur {dr().maxDepthReached}
                              </span>
                            </div>
                            <Show
                              when={dr().tree.shorts.length > 0}
                              fallback={
                                <div class="flex items-center gap-2 rounded-md bg-ferme/10 px-3 py-2 text-[12px] font-medium text-ferme">
                                  <span class="material-symbols-outlined text-[16px]">check_circle</span>
                                  Tous les composants sont disponibles
                                </div>
                              }
                            >
                              <div class="overflow-hidden rounded-md border border-border">
                                <DiagColHeader />
                                <For each={dr().tree.shorts}>
                                  {(s) => <DiagShortRow short={s} />}
                                </For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </Show>
                    </Show>
                  </Show>
                </Show>
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

const TabBtn: Component<{ active: boolean; onClick: () => void; children: any }> = (p) => (
  <button
    onClick={p.onClick}
    class={cx(
      'flex items-center gap-1.5 border-b-2 px-5 py-2.5 font-mono text-[11px] font-semibold transition-colors',
      p.active
        ? 'border-terra text-terra'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    )}
  >
    {p.children}
  </button>
)

export default OfDetailSheet
