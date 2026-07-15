import { For, Show, createResource, createSignal, createEffect, type Component } from 'solid-js'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cx } from '@/libs/cva'
import type { OfDetail } from '@/lib/of/types'
import { type DiagResult } from '@/lib/of/diagnostic-types'
import { route } from '@/lib/routes'
import { router } from '@/lib/inertia-solid'
import { OfDiagnosticTree } from './of-diagnostic-tree'
import { OfFirmAction } from './of-firm-action'

// ---------------------------------------------------------------------------
// Sheet détaillée d'un OF (issue #52 — shell d'orchestration).
//
// Le composant orchestre : fetch du détail + diagnostic (lazy), état (onglet,
// affermissement, confirmation rupture), et le rendu shell (barre d'identité,
// méta+avancement, onglets). Les vues lourdes sont déléguées :
//   • arbre diagnostic récursif → <OfDiagnosticTree> (of-diagnostic-tree.tsx)
//   • action affermir + popover rupture → <OfFirmAction> (of-firm-action.tsx)
// Le tab « Composants » (récap ruptures + table BOM) reste inline : lié
// intimement à d() et sans récursion complexe.
// ---------------------------------------------------------------------------

export const OfDetailSheet: Component<{
  num: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Appelé après affermissement réussi (n° origine + n° OF créé) pour une mise
   *  à jour optimiste du board (transformation de la carte en place). Si fourni,
   *  le sheet déclenche aussi un reload partiel `only:['board']` pour réconcilier. */
  onFirmed?: (oldNum: string, newMfgNum: string) => void
}> = (props) => {
  const [tab, setTab] = createSignal<'composants' | 'diagnostic'>('composants')
  // Devient true au premier clic sur "Diagnostic récursif" — déclenche le fetch une seule fois.
  const [diagRequested, setDiagRequested] = createSignal(false)

  // Réinitialise l'état quand l'OF change (nouvelle carte cliquée).
  createEffect(() => {
    props.num // track
    setTab('composants')
    setDiagRequested(false)
    setFirmMsg(null)
    setConfirmRupture(false)
  })

  const [detail, { refetch: refetchDetail }] = createResource(
    () => (props.open ? props.num : null),
    async (num) => {
      if (!num) return null
      const res = await fetch(route('scheduler.of_detail', { of: num }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as OfDetail
    }
  )

  // Affermissement (write-back X3 FUNMAUTR, #31). ~13s : spinner + message.
  const [firming, setFirming] = createSignal(false)
  const [firmMsg, setFirmMsg] = createSignal<{ ok: boolean; text: string } | null>(null)
  // Confirmation requise pour affermir un OF en rupture (défaut : interdit).
  const [confirmRupture, setConfirmRupture] = createSignal(false)

  const isSuggestion = () => (detail()?.statusLabel ?? '').toLowerCase().includes('sugg')
  /** Composants en rupture (table Composants) — pilote le warning d'affermissement. */
  const rupturedComponents = () => (detail()?.bom ?? []).filter((r) => !r.ok)
  const hasRuptures = () => rupturedComponents().length > 0
  const canFirm = () => {
    if (firmMsg()?.ok) return false // déjà affermi ce tour → on masque le bouton
    const s = (detail()?.statusLabel ?? '').toLowerCase()
    return s.includes('sugg') || s.includes('plan')
  }

  /** Gate : par défaut l'affermissement d'un OF en rupture est interdit — il faut
   *  confirmer explicitement. Sans rupture, on affermit directement. */
  const firm = () => {
    if (hasRuptures() && !confirmRupture()) {
      setConfirmRupture(true)
      return
    }
    void doFirm()
  }

  const doFirm = async () => {
    const d = detail()
    if (!d) return
    setConfirmRupture(false)
    setFirming(true)
    setFirmMsg(null)
    try {
      const suggestion = isSuggestion()
      const url = suggestion
        ? route('planning.suggestion_firm', { sugNum: d.num })
        : route('planning.order_firm', { orderNum: d.num })
      const res = await fetch(url, { method: 'POST' })
      const data = (await res.json()) as { ok: boolean; mfgNum?: string; error?: string }
      if (data.ok && data.mfgNum) {
        setFirmMsg({ ok: true, text: `OF ${data.mfgNum} affermi` })
        // Mise à jour optimiste : la carte se transforme en place (id → nouvel OF)
        // au lieu de disparaître puis réapparaître lentement. Le reload réconcilie.
        props.onFirmed?.(d.num, data.mfgNum)
        if (data.mfgNum !== d.num) {
          // Suggestion→OF : le n° d'origine (SGAE…) n'existe plus → on ferme le sheet.
          props.onOpenChange(false)
        } else {
          // Planifié→ferme : même n°, on rafraîchit le détail (statut → Ferme).
          await refetchDetail()
        }
        // Reload FULL et retardé : FUNMAUTR consomme la suggestion dans ORDERS, mais
        // ORDERS propage avec un léger delta. Un reload immédiat/lecture-cachée
        // ramenait la suggestion stale (le transformCard était écrasé). On laisse
        // ~2s à ORDERS, puis reload full (le transformCard assure le visuel meantime).
        setTimeout(() => router.reload(), 2000)
      } else {
        setFirmMsg({ ok: false, text: data.error ?? 'Affermissement refusé par X3.' })
      }
    } catch (e) {
      setFirmMsg({ ok: false, text: (e as Error).message })
    } finally {
      setFirming(false)
    }
  }

  // Diagnostic : lazy (diagRequested) + memoïsé pour la durée d'ouverture du sheet.
  const [diag] = createResource(
    () => (diagRequested() && props.open ? props.num : null),
    async (numOf) => {
      if (!numOf) return null
      const res = await fetch(route('planning_board.of_materials_diagnostic', { of: numOf }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as DiagResult
    }
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
        class="theme-navy gap-0 flex h-[72vh] w-full max-w-none flex-col rounded-t-xl p-0"
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
                <span class="material-symbols-outlined animate-spin text-[28px]">
                  progress_activity
                </span>
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
                  <span class="font-mono text-[12px] font-bold text-brand">{d().article}</span>
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
                <Show when={firmMsg()}>
                  {(m) => (
                    <span
                      class={`font-mono text-[11px] font-semibold ${m().ok ? 'text-ferme' : 'text-destructive'}`}
                    >
                      {m().ok ? '✓ ' : '⚠ '}
                      {m().text}
                    </span>
                  )}
                </Show>
                <Show when={canFirm()}>
                  <OfFirmAction
                    firming={firming}
                    confirmRupture={confirmRupture}
                    isSuggestion={isSuggestion}
                    rupturedComponents={rupturedComponents}
                    onFirm={firm}
                    onDoFirm={doFirm}
                    onCancelConfirm={() => setConfirmRupture(false)}
                  />
                </Show>
              </div>

              {/* Méta + avancement */}
              <div class="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-rule-soft px-5 py-2.5">
                <Meta k="Début" v={d().cycle.start} mono />
                <span class="material-symbols-outlined text-[15px] text-muted-foreground">
                  arrow_forward
                </span>
                <Meta k="Fin" v={d().cycle.end} mono />
                <Show when={d().context}>
                  <Meta k="Poste" v={d().context} />
                </Show>
                <Meta k="Créé le" v={d().createdAt} mono />
                <Show when={d().operator.name !== 'Non assigné'}>
                  <Meta k="Par" v={d().operator.name} mono />
                </Show>
                <For each={d().stats}>{(s) => <Meta k={s.label} v={s.value} mono />}</For>
                <div class="ml-auto flex items-center gap-2">
                  <span class="font-mono text-[10px] font-semibold text-muted-foreground">
                    Avancement
                  </span>
                  <span class="h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
                    <span
                      class="block h-full rounded-full bg-brand"
                      style={{ width: `${d().progressPct}%` }}
                    />
                  </span>
                  <span class="font-mono text-[11px] font-bold text-foreground">
                    {d().progressPct}%
                  </span>
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
                    <span class="ml-auto font-mono text-[11px] text-muted-foreground">
                      {d().bomCount} articles
                    </span>
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
                            : 'border-destructive/20 bg-destructive/10 border-l-2 border-l-destructive'
                        )}
                        title={`${row.id} — ${row.name}`}
                      >
                        <span
                          class={cx(
                            'truncate font-mono text-[12px] font-bold',
                            row.ok ? 'text-foreground' : 'text-destructive'
                          )}
                        >
                          {row.id}
                        </span>
                        <span class="truncate text-[12px] text-foreground/80">{row.name}</span>
                        <span class="text-right font-mono text-[12px] text-foreground">
                          {row.need} {row.unit}
                        </span>
                        <span class="text-right font-mono text-[12px] text-muted-foreground">
                          {row.stock}
                        </span>
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
                        <span class="material-symbols-outlined animate-spin text-[24px]">
                          progress_activity
                        </span>
                        <span class="text-[12px]">Diagnostic en cours…</span>
                      </div>
                    }
                  >
                    <Show
                      when={!diag.error}
                      fallback={
                        <div class="flex flex-col items-center gap-2 py-8 text-destructive">
                          <span class="material-symbols-outlined text-[22px]">error</span>
                          <span class="text-[12px] font-medium">
                            {(diag.error as Error)?.message}
                          </span>
                        </div>
                      }
                    >
                      <Show when={diag()}>{(dr) => <OfDiagnosticTree result={dr()} />}</Show>
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
    <span class={cx('font-fraunces text-[13px] font-bold text-foreground', p.mono && 'font-mono')}>
      {p.v}
    </span>
  </div>
)

const TabBtn: Component<{ active: boolean; onClick: () => void; children: any }> = (p) => (
  <button
    onClick={p.onClick}
    class={cx(
      'flex items-center gap-1.5 border-b-2 px-5 py-2.5 font-mono text-[11px] font-semibold transition-colors',
      p.active
        ? 'border-brand text-brand'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    )}
  >
    {p.children}
  </button>
)

export default OfDetailSheet
