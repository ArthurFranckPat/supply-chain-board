import { For, Show, createMemo, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
import type { VisionCommande, VisionLink } from '@/lib/vision/types'
import type { ImpactVerdict } from '@/lib/vision/impact'
import { deltaLabel } from '@/lib/vision/impact'
import type { HealthCategory } from '@/components/vision/plan-health'

/**
 * Programme v2 — rail de triage « À traiter ». Panneau latéral repliable qui
 * liste les problèmes (retards / limites / sans-lien) triés par gravité ×
 * proximité du besoin. Cliquer un item centre le board sur l'OF, allume le
 * lien, ouvre les actions.
 *
 * Le rail transforme la page : on ne scanne plus ~40 cartes, on traite une
 * file. Les problèmes viennent au planificateur.
 */

interface TriageItem {
  commandeId: string
  numCommande: string
  ligne: string | null
  client: string | null
  verdict: ImpactVerdict | null
  delta: number | null
  besoinIso: string | null
  ofId: string | null
  ofDateFinIso: string | null
}

type Tab = Exclude<HealthCategory, 'ruptures'>

const TAB_LABELS: Record<Tab, string> = {
  retards: 'Retards',
  limites: 'Limites',
  sanslien: 'Sans lien',
}

const SEVERITY: Record<string, number> = { retard: 2, limite: 1 }

const VERDICT_DOT: Record<ImpactVerdict, string> = {
  retard: 'bg-error',
  limite: 'bg-amber-500',
  ok: 'bg-ferme',
}
const VERDICT_DELTA_TONE: Record<ImpactVerdict, string> = {
  retard: 'bg-error/10 text-error',
  limite: 'bg-amber-500/10 text-amber-600',
  ok: 'bg-ferme/10 text-ferme',
}

export function TriageRail(props: {
  commandes: VisionCommande[]
  links: VisionLink[]
  verdictByCmd: Accessor<Map<string, { verdict: ImpactVerdict | null; delta: number | null }>>
  activeTab: Accessor<Tab>
  setActiveTab: (t: Tab) => void
  selectedId: Accessor<string | null>
  onSelect: (item: TriageItem) => void
  onDetailOf: (ofId: string) => void
  onClose: () => void
  counts: Accessor<Record<Tab, number>>
}) {
  const items = createMemo<TriageItem[]>(() => {
    const verdicts = props.verdictByCmd()
    const linksByCmd = new Map<string, VisionLink>()
    for (const l of props.links) {
      if (!linksByCmd.has(l.commandeId)) linksByCmd.set(l.commandeId, l)
    }
    const tab = props.activeTab()
    const out: TriageItem[] = []
    for (const cmd of props.commandes) {
      const v = verdicts.get(cmd.id)
      const verdict = v?.verdict ?? null
      const delta = v?.delta ?? null
      // Filtrage par onglet
      if (tab === 'retards' && verdict !== 'retard') continue
      if (tab === 'limites' && verdict !== 'limite') continue
      if (tab === 'sanslien' && verdict !== null) continue
      const link = linksByCmd.get(cmd.id)
      out.push({
        commandeId: cmd.id,
        numCommande: cmd.numCommande,
        ligne: cmd.ligne,
        client: cmd.client,
        verdict,
        delta,
        besoinIso: cmd.dateExpeditionIso,
        ofId: link?.ofId ?? null,
        ofDateFinIso: link?.ofDateFinIso ?? null,
      })
    }
    // Tri : gravité desc, puis delta asc (le plus proche du besoin d'abord)
    out.sort((a, b) => {
      const sa = SEVERITY[a.verdict ?? ''] ?? 0
      const sb = SEVERITY[b.verdict ?? ''] ?? 0
      if (sb !== sa) return sb - sa
      return (a.delta ?? Infinity) - (b.delta ?? Infinity)
    })
    return out
  })

  const tabs = (): Tab[] => ['retards', 'limites', 'sanslien']

  return (
    <div class="flex h-full w-[300px] flex-none flex-col border-l border-rule bg-card">
      {/* Header */}
      <div class="flex items-center gap-2 border-b border-rule px-3.5 py-2.5">
        <span class="material-symbols-outlined text-sm text-muted-foreground">queue</span>
        <b class="text-xs">À traiter</b>
        <span class="font-mono text-2xs text-muted-foreground">{items().length}</span>
        <div class="flex-1" />
        <span class="font-mono text-2xs text-muted-foreground">Gravité ▾</span>
        <button
          type="button"
          aria-label="Fermer le rail de triage"
          onClick={props.onClose}
          class="text-muted-foreground hover:text-foreground"
        >
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      {/* Onglets */}
      <div class="flex gap-1 border-b border-rule-soft px-3 py-2">
        <For each={tabs()}>
          {(t) => (
            <button
              type="button"
              onClick={() => props.setActiveTab(t)}
              class={cx(
                'rounded-full border px-2.5 py-1 font-mono text-2xs font-bold transition-colors',
                props.activeTab() === t
                  ? t === 'retards'
                    ? 'border-error bg-error/10 text-error'
                    : t === 'limites'
                      ? 'border-amber-500 text-amber-600'
                      : 'border-muted-foreground text-muted-foreground'
                  : 'border-rule text-muted-foreground hover:text-foreground'
              )}
            >
              {TAB_LABELS[t]} {props.counts()[t]}
            </button>
          )}
        </For>
      </div>

      {/* Liste */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={items().length > 0}
          fallback={
            <div class="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span class="material-symbols-outlined text-[24px] text-ferme/60">task_alt</span>
              <span class="font-fraunces text-sm font-bold">Rien à traiter</span>
              <span class="font-fraunces text-2xs italic text-muted-foreground">
                Aucun élément dans cette catégorie.
              </span>
            </div>
          }
        >
          <For each={items()}>
            {(item) => (
              <button
                type="button"
                onClick={() => props.onSelect(item)}
                class={cx(
                  'block w-full border-b border-rule-soft px-3.5 py-2.5 text-left transition-colors hover:bg-accent',
                  props.selectedId() === item.commandeId &&
                    'bg-brand-soft/50 shadow-[inset_3px_0_0_var(--color-brand)]'
                )}
              >
                {/* Ligne 1 : dot + id + delta */}
                <div class="flex items-center gap-2">
                  <span
                    class={cx(
                      'size-2 flex-none rounded-full',
                      item.verdict ? VERDICT_DOT[item.verdict] : 'bg-muted-foreground'
                    )}
                  />
                  <span class="font-mono text-xs font-bold text-foreground">
                    {item.numCommande}
                    <Show when={item.ligne}>
                      <span class="text-muted-foreground">·L{item.ligne}</span>
                    </Show>
                  </span>
                  <div class="flex-1" />
                  <Show when={item.verdict && item.delta !== null}>
                    <span
                      class={cx(
                        'rounded-full px-1.5 py-px font-mono text-2xs font-bold tabular-nums',
                        item.verdict && VERDICT_DELTA_TONE[item.verdict]
                      )}
                    >
                      {deltaLabel(item.delta)}
                    </span>
                  </Show>
                  <Show when={item.verdict === null}>
                    <span class="font-mono text-2xs text-muted-foreground">non évaluée</span>
                  </Show>
                </div>
                {/* Ligne 2 : client + dates */}
                <div class="mt-1 text-2xs text-muted-foreground">
                  <Show when={item.client}>{item.client} · </Show>
                  <Show when={item.besoinIso}>besoin {fmtDayShort(item.besoinIso)}</Show>
                  <Show when={item.ofId && item.ofDateFinIso}>
                    {' '}
                    · {item.ofId} finit {fmtDayShort(item.ofDateFinIso!)}
                  </Show>
                </div>
                {/* Ligne 3 : actions */}
                <div class="mt-1.5 flex gap-1.5">
                  <span class="text-2xs font-semibold text-brand">Voir sur le board</span>
                  <Show when={item.ofId}>
                    <span class="text-2xs text-muted-foreground">·</span>
                    <span class="text-2xs font-semibold text-muted-foreground">Détail OF</span>
                  </Show>
                </div>
              </button>
            )}
          </For>
        </Show>
      </div>

      {/* Footer */}
      <div class="border-t border-rule-soft px-3.5 py-2 font-fraunces text-2xs italic text-muted-foreground">
        Trié gravité × proximité du besoin.
      </div>
    </div>
  )
}

/** Date ISO → « 8 juil. » (français court). */
function fmtDayShort(iso: string): string {
  const d = parseIsoSafe(iso)
  if (!d) return '?'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
function parseIsoSafe(iso: string): Date | null {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export type { TriageItem }
