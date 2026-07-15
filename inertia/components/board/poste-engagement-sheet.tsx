import { For, Show, createResource, type Component } from 'solid-js'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cx } from '@/libs/cva'
import { route } from '@/lib/routes'

/**
 * Issue #46 — panneau « Engagement » d'un poste : TOUS les OF fermes de la ligne
 * + leurs commandes liées, triés par urgence client. Le board ne montre que la
 * fenêtre sélectionnée ; ici la donnée vient de l'endpoint dédié
 * GET /api/v1/planning/postes/:poste/engagement (lookback ~90 j, sans limite
 * de fenêtre board), fetchée à l'ouverture puis memoïsée par poste.
 */

interface EngagementCmd {
  numCommande: string
  ligne: string | null
  client: string | null
  livraisonIso: string | null
  /** 'matcher' = chaîne board ; 'peg' = repli contremarque (commande hors fenêtre). */
  method: 'matcher' | 'peg'
}

interface EngagementRow {
  numOf: string
  article: string
  designation: string | null
  done: number
  launched: number
  dateDebutIso: string | null
  hours: number
  commandes: EngagementCmd[]
  livraisonIso: string | null
}

interface EngagementPayload {
  poste: { code: string; label: string }
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  rows: EngagementRow[]
  x3Error: string | null
}

/** ISO YYYY-MM-DD → JJ/MM/AA — '—' si absente. */
const fmtDateFr = (iso: string | null): string => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}

const fmtH = (h: number) => (Math.round(h * 100) / 100).toFixed(2).replace('.', ',')
/** Convention métier : 1 jour = 7 heures. */
const fmtJ = (h: number) => (Math.round((h / 7) * 10) / 10).toFixed(1).replace('.', ',')

/** Seuil d'urgence d'une livraison, pour la couleur + le regroupement visuel.
 *  - 'overdue' : livraison avant aujourd'hui (matériel non livré = alerte).
 *  - 'week'    : livraison dans les 7 prochains jours.
 *  - 'later'   : au-delà, ou sans date. */
type Urgency = 'overdue' | 'week' | 'later'
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, week: 1, later: 2 }

const todayIso = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const urgencyOf = (livraisonIso: string | null): Urgency => {
  if (!livraisonIso) return 'later'
  const today = todayIso()
  if (livraisonIso < today) return 'overdue'
  const weekLater = new Date()
  weekLater.setDate(weekLater.getDate() + 7)
  const y = weekLater.getFullYear()
  const m = String(weekLater.getMonth() + 1).padStart(2, '0')
  const da = String(weekLater.getDate()).padStart(2, '0')
  return livraisonIso <= `${y}-${m}-${da}` ? 'week' : 'later'
}

/** Couleur de la date de livraison selon l'urgence. */
const urgencyColor = (u: Urgency): string =>
  u === 'overdue' ? 'text-danger' : u === 'week' ? 'text-brand' : 'text-muted-foreground'

/** Saturation charge/capacité — renvoie % et sévérité visuelle pour la jauge. */
const saturation = (
  totalHours: number,
  capacity: number | null
): { pct: number | null; level: 'ok' | 'high' | 'crit' } => {
  if (!capacity || capacity <= 0) return { pct: null, level: 'ok' }
  const pct = (totalHours / capacity) * 100
  return { pct: Math.round(pct), level: pct > 100 ? 'crit' : pct > 85 ? 'high' : 'ok' }
}

export const PosteEngagementSheet: Component<{
  /** Code du poste ouvert (null = fermé). */
  posteCode: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}> = (props) => {
  const [data] = createResource(
    () => (props.open ? props.posteCode : null),
    async (poste) => {
      const res = await fetch(route('scheduler.poste_engagement', { poste }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as EngagementPayload
    }
  )

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        class="theme-navy flex h-[72vh] w-full max-w-none flex-col gap-0 rounded-t-xl p-0"
      >
        <Show
          when={data()}
          fallback={
            <Show
              when={!data.error}
              fallback={
                <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
                  <span class="material-symbols-outlined text-[26px]">error</span>
                  <span class="text-sm font-medium">Échec du chargement de l'engagement.</span>
                </div>
              }
            >
              <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                <span class="material-symbols-outlined animate-spin text-[26px]">
                  progress_activity
                </span>
                <span class="text-sm">Chargement…</span>
              </div>
            </Show>
          }
        >
          {(d) => {
            const sat = () => saturation(d().totalHours, d().weeklyCapacityHours)
            const weeksEngaged = () =>
              d().weeklyCapacityHours
                ? Math.round((d().totalHours / d().weeklyCapacityHours) * 10) / 10
                : null
            return (
              <>
                {/* Barre d'identité poste + saturation charge/capacité. */}
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-5 py-3 pr-14">
                  <span class="material-symbols-outlined self-center text-[18px] text-brand">
                    inventory_2
                  </span>
                  <div class="flex items-baseline gap-2">
                    <span class="font-mono text-[13px] font-bold text-foreground">
                      {d().poste.code}
                    </span>
                    <SheetTitle class="font-fraunces text-[14px] font-medium italic text-muted-foreground">
                      {d().poste.label}
                    </SheetTitle>
                  </div>
                  <span class="flex-1" />
                  {/* Métriques : OF count + heures + semaines engagées + jauge saturation. */}
                  <div class="flex items-center gap-3">
                    <span class="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {d().count} OF
                    </span>
                    <span class="h-4 w-px bg-border" />
                    <div class="flex items-baseline gap-1">
                      <span class="font-fraunces text-[17px] font-bold tabular-nums text-foreground">
                        {fmtH(d().totalHours)}
                      </span>
                      <span class="font-mono text-[10px] font-semibold text-muted-foreground">
                        h
                      </span>
                      <Show when={weeksEngaged() !== null}>
                        <span class="ml-1 font-mono text-[11px] font-semibold text-muted-foreground">
                          ≈ {fmtJ(d().totalHours)} j
                        </span>
                      </Show>
                    </div>
                    {/* Jauge saturation : affichée seulement si capacité connue. */}
                    <Show when={sat().pct !== null}>
                      <div class="flex items-center gap-2">
                        <div class="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule-soft">
                          <div
                            class="absolute inset-y-0 left-0 rounded-full transition-all"
                            classList={{
                              'bg-ferme': sat().level === 'ok',
                              'bg-suggere': sat().level === 'high',
                              'bg-danger': sat().level === 'crit',
                            }}
                            style={{ width: `${Math.min(100, sat().pct ?? 0)}%` }}
                          />
                        </div>
                        <span
                          class="font-mono text-[11px] font-bold tabular-nums"
                          classList={{
                            'text-ferme': sat().level === 'ok',
                            'text-suggere': sat().level === 'high',
                            'text-danger': sat().level === 'crit',
                          }}
                        >
                          {sat().pct}%
                        </span>
                      </div>
                    </Show>
                  </div>
                </div>

                <Show when={d().x3Error}>
                  <div class="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px] text-foreground">
                    <span class="material-symbols-outlined mt-px text-[16px] text-brand">
                      warning
                    </span>
                    <span class="flex-none font-bold">Matching partiel :</span>
                    <span class="font-mono break-all">{d().x3Error}</span>
                  </div>
                </Show>

                <Show
                  when={d().rows.length > 0}
                  fallback={
                    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                      <span class="material-symbols-outlined text-[26px]">inventory_2</span>
                      <span class="font-fraunces text-[13px] italic">
                        Aucun OF ferme sur ce poste.
                      </span>
                    </div>
                  }
                >
                  <div class="flex-1 overflow-auto">
                    {/* En-tête tableau STICKY — reste visible au défilement. */}
                    <div class="sticky top-0 z-10 grid grid-cols-[7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem] items-center gap-3 border-b border-border bg-secondary px-5 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                      <span>OF</span>
                      <span>ARTICLE</span>
                      <span>DÉSIGNATION</span>
                      <span class="text-right">AVANCEMENT</span>
                      <span>COMMANDE(S)</span>
                      <span>LIVRAISON</span>
                      <span class="text-right">HEURES</span>
                      <span class="text-right">JOURS</span>
                    </div>

                    {/* Séparateur de groupe d'urgence. Les rows sont déjà triées par
                      urgence (loader) : on insère un séparateur quand l'urgence
                      change, avec un libellé explicite. Pas de collapse — on garde
                      un scan plat mais la structure saute aux yeux. */}
                    <For each={d().rows}>
                      {(r, i) => {
                        const u = () => urgencyOf(r.livraisonIso)
                        const prevU = () =>
                          i() > 0 ? urgencyOf(d().rows[i() - 1].livraisonIso) : null
                        const showSep = () => prevU() === null || prevU() !== u()
                        const sepLabel = () =>
                          u() === 'overdue'
                            ? '⚠ En retard'
                            : u() === 'week'
                              ? '◐ Cette semaine'
                              : '○ À venir'
                        const avancement = () =>
                          r.launched > 0
                            ? Math.min(100, Math.round((r.done / r.launched) * 100))
                            : 0
                        return (
                          <>
                            <Show when={showSep()}>
                              <div
                                class="flex items-center gap-2 px-5 pt-3 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                                classList={{
                                  'text-danger': u() === 'overdue',
                                  'text-brand': u() === 'week',
                                  'text-muted-foreground': u() === 'later',
                                }}
                              >
                                <span
                                  class="inline-block h-px flex-none w-4"
                                  classList={{
                                    'bg-danger': u() === 'overdue',
                                    'bg-brand': u() === 'week',
                                    'bg-rule': u() === 'later',
                                  }}
                                />
                                {sepLabel()}
                              </div>
                            </Show>
                            <div class="grid grid-cols-[7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem] items-center gap-3 border-b border-rule-soft px-5 py-2 transition-colors hover:bg-secondary/50">
                              <span class="truncate font-mono text-[12px] font-bold text-foreground">
                                {r.numOf}
                              </span>
                              <span class="truncate font-mono text-[11px] font-bold text-brand">
                                {r.article}
                              </span>
                              <span
                                class="truncate text-[12px] text-foreground/80"
                                title={r.designation ?? undefined}
                              >
                                {r.designation ?? '—'}
                              </span>
                              {/* Avancement : micro-jauge done/launched. La barre est
                                calée dans une boîte h-2.5 pour aligner son centre
                                sur le milieu x-height du texte — sinon la barre (h-1)
                                paraît flotter sous le texte 10px. Parité avec la jauge
                                saturation du header (mêmes dimensions h-1 / track). */}
                              <div class="flex items-center gap-2">
                                <div class="relative h-2.5 w-full">
                                  <div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-rule-soft">
                                    <div
                                      classList={{
                                        'absolute inset-y-0 left-0 rounded-full bg-ferme':
                                          avancement() >= 100,
                                        'absolute inset-y-0 left-0 rounded-full bg-planifie':
                                          avancement() > 0 && avancement() < 100,
                                      }}
                                      style={{ width: `${avancement()}%` }}
                                    />
                                  </div>
                                </div>
                                <span class="flex-none font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                                  {r.done}/{r.launched}
                                </span>
                              </div>
                              {/* Commande(s) — parité board-card.tsx : cmd en mono gras,
                                ·ligne en mono medium muted (séparés, shrink-0), client
                                en fraunces italic sur sa propre ligne. items-center
                                (pas baseline) pour aligner les boîtes indépendamment
                                des tailles de police. */}
                              <div class="min-w-0">
                                <Show
                                  when={r.commandes.length > 0}
                                  fallback={
                                    <span class="font-mono text-[11px] text-muted-foreground">
                                      —
                                    </span>
                                  }
                                >
                                  <For each={r.commandes}>
                                    {(c) => (
                                      <div class="min-w-0">
                                        <div
                                          class="flex items-center gap-1.5 overflow-hidden"
                                          title={`${c.numCommande}${c.ligne ? `·L${c.ligne}` : ''}${c.client ? ` — ${c.client}` : ''}`}
                                        >
                                          <span class="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold leading-tight text-foreground">
                                            {c.numCommande}
                                          </span>
                                          <Show when={c.ligne}>
                                            <span class="shrink-0 whitespace-nowrap font-mono text-[10px] font-medium leading-tight text-muted-foreground">
                                              ·L{c.ligne}
                                            </span>
                                          </Show>
                                        </div>
                                        <Show when={c.client}>
                                          <div class="truncate font-fraunces text-[10px] italic leading-tight text-muted-foreground">
                                            {c.client}
                                          </div>
                                        </Show>
                                      </div>
                                    )}
                                  </For>
                                </Show>
                              </div>
                              <span
                                class={cx(
                                  'font-mono text-[11px] font-bold tabular-nums',
                                  urgencyColor(u())
                                )}
                              >
                                {fmtDateFr(r.livraisonIso)}
                              </span>
                              <span class="text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                                {fmtH(r.hours)}
                              </span>
                              <span class="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                                {fmtJ(r.hours)}
                              </span>
                            </div>
                          </>
                        )
                      }}
                    </For>
                  </div>
                </Show>
              </>
            )
          }}
        </Show>
      </SheetContent>
    </Sheet>
  )
}

export default PosteEngagementSheet
