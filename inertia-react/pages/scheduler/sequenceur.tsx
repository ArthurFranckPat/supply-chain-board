import { useMemo, useState } from 'react'
import { Head } from '@inertiajs/react'
import { Package, Search, TriangleAlert } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import { PILL, Segment, SegmentButton, ToolbarRow, ToolbarSpacer } from '@r/components/vision/toolbar'
import {
  type EngagementRow,
  type Urgency,
  fmtDateFr,
  fmtH,
  fmtJ,
  saturation,
  urgencyColor,
  urgencyOf,
} from '@r/lib/board/engagement-format'

/**
 * Page « Séquenceur » — vue transverse de l'engagement OF par poste (issue #46,
 * lot page dédiée). Même dataset que le panneau `PosteEngagementSheet` (board
 * /programme), calculé une seule fois côté serveur (`loadAllPostesEngagement`)
 * pour tous les postes ; filtrage poste/urgence/recherche fait ici côté client
 * (pas de rechargement serveur au changement de filtre).
 */

interface PosteSummary {
  code: string
  label: string
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
}

type SequenceurRow = EngagementRow & { posteCode: string; posteLabel: string }

interface SequenceurPageProps {
  postes: PosteSummary[]
  rows: SequenceurRow[]
  selectedPoste: string | null
  x3Error: string | null
}

const ROW_GRID_ALL = 'grid-cols-[6rem_7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem]'
const ROW_GRID_ONE = 'grid-cols-[7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem]'

export default function Sequenceur(props: SequenceurPageProps) {
  const [posteFilter, setPosteFilter] = useState<string | null>(props.selectedPoste)
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'all'>('all')
  const [query, setQuery] = useState('')

  const activePoste = posteFilter ? props.postes.find((p) => p.code === posteFilter) : null

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return props.rows
      .filter((r) => !posteFilter || r.posteCode === posteFilter)
      .filter((r) => urgencyFilter === 'all' || urgencyOf(r.livraisonIso) === urgencyFilter)
      .filter((r) => {
        if (!q) return true
        const haystack = [
          r.numOf,
          r.article,
          r.designation ?? '',
          r.posteCode,
          ...r.commandes.flatMap((c) => [c.numCommande, c.client ?? '']),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
      .sort(
        (a, b) =>
          (a.livraisonIso ?? '9999').localeCompare(b.livraisonIso ?? '9999') ||
          (a.dateDebutIso ?? '9999').localeCompare(b.dateDebutIso ?? '9999') ||
          a.numOf.localeCompare(b.numOf)
      )
  }, [props.rows, posteFilter, urgencyFilter, query])

  const showPosteCol = !posteFilter
  const totalHours = Math.round(filteredRows.reduce((s, r) => s + r.hours, 0) * 100) / 100
  const sat = activePoste ? saturation(activePoste.totalHours, activePoste.weeklyCapacityHours) : null
  const weeksEngaged =
    activePoste && activePoste.weeklyCapacityHours
      ? Math.round((activePoste.totalHours / activePoste.weeklyCapacityHours) * 10) / 10
      : null

  return (
    <AppLayout
      title="Séquenceur · Engagement postes"
      active="sequenceur"
      subtitle="Séquenceur · engagement OF par poste"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <div>
          <b className="font-bold text-foreground">{filteredRows.length}</b> OF ·{' '}
          <b className="font-bold text-foreground">{fmtH(totalHours)}</b> h engagées
        </div>
      }
    >
      <Head title="Séquenceur" />
      <div className="flex h-full min-h-0 flex-col">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Matching partiel :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        {/* Toolbar : poste, urgence, recherche. */}
        <ToolbarRow className="text-xs font-semibold text-secondary-foreground">
          <select
            value={posteFilter ?? ''}
            onChange={(e) => setPosteFilter(e.currentTarget.value || null)}
            className="h-[30px] rounded-full border border-rule bg-card px-3 text-xs font-semibold text-foreground focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          >
            <option value="">Tous les postes</option>
            {props.postes.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} — {p.label}
              </option>
            ))}
          </select>

          <Segment role="radiogroup" ariaLabel="Urgence">
            {(
              [
                ['all', 'Toutes'],
                ['overdue', 'En retard'],
                ['week', 'Cette semaine'],
                ['later', 'À venir'],
              ] as const
            ).map(([id, label]) => (
              <SegmentButton
                key={id}
                role="radio"
                active={urgencyFilter === id}
                onClick={() => setUrgencyFilter(id)}
              >
                {label}
              </SegmentButton>
            ))}
          </Segment>

          <ToolbarSpacer />

          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[220px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="OF, article, commande, client…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
        </ToolbarRow>

        {/* Bandeau postes — sert aussi de liste de postes (n'existe nulle part
            ailleurs dans l'app), cliquable pour filtrer. */}
        <div className="flex flex-none items-center gap-2 overflow-x-auto border-b border-rule bg-secondary/40 px-7 py-2.5">
          {props.postes.map((p) => {
            const s = saturation(p.totalHours, p.weeklyCapacityHours)
            const active = posteFilter === p.code
            return (
              <button
                key={p.code}
                type="button"
                onClick={() => setPosteFilter(active ? null : p.code)}
                className={cn(
                  'flex flex-none items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-[11px] transition-colors',
                  active
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-rule bg-card text-foreground hover:border-brand/50'
                )}
                title={p.label}
              >
                <span className="font-bold">{p.code}</span>
                <span className="text-muted-foreground">{p.count} OF</span>
                {s.pct !== null && (
                  <span
                    className={cn(
                      'font-bold',
                      s.level === 'ok' && 'text-ferme',
                      s.level === 'high' && 'text-suggere',
                      s.level === 'crit' && 'text-danger'
                    )}
                  >
                    {s.pct}%
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Identité poste + saturation — uniquement quand un seul poste est filtré. */}
        {activePoste && (
          <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-7 py-3">
            <Package size={18} strokeWidth={1.75} className="text-brand" />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[13px] font-bold text-foreground">{activePoste.code}</span>
              <span className="font-fraunces text-[14px] font-medium italic text-muted-foreground">
                {activePoste.label}
              </span>
            </div>
            <span className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1">
                <span className="font-fraunces text-[17px] font-bold tabular-nums text-foreground">
                  {fmtH(activePoste.totalHours)}
                </span>
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">h</span>
                {weeksEngaged !== null && (
                  <span className="ml-1 font-mono text-[11px] font-semibold text-muted-foreground">
                    ≈ {fmtJ(activePoste.totalHours)} j
                  </span>
                )}
              </div>
              {sat && sat.pct !== null && (
                <div className="flex items-center gap-2">
                  <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule-soft">
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full transition-all',
                        sat.level === 'ok' && 'bg-ferme',
                        sat.level === 'high' && 'bg-suggere',
                        sat.level === 'crit' && 'bg-danger'
                      )}
                      style={{ width: `${Math.min(100, sat.pct)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[11px] font-bold tabular-nums',
                      sat.level === 'ok' && 'text-ferme',
                      sat.level === 'high' && 'text-suggere',
                      sat.level === 'crit' && 'text-danger'
                    )}
                  >
                    {sat.pct}%
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tableau. */}
        {filteredRows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <Package size={26} strokeWidth={1.75} />
            <span className="font-fraunces text-[13px] italic">Aucun OF pour ces filtres.</span>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div
              className={cn(
                'sticky top-0 z-10 grid items-center gap-3 border-b border-border bg-secondary px-7 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground',
                showPosteCol ? ROW_GRID_ALL : ROW_GRID_ONE
              )}
            >
              {showPosteCol && <span>POSTE</span>}
              <span>OF</span>
              <span>ARTICLE</span>
              <span>DÉSIGNATION</span>
              <span className="text-right">AVANCEMENT</span>
              <span>COMMANDE(S)</span>
              <span>LIVRAISON</span>
              <span className="text-right">HEURES</span>
              <span className="text-right">JOURS</span>
            </div>

            {filteredRows.map((r, i) => {
              const u = urgencyOf(r.livraisonIso)
              const prevU = i > 0 ? urgencyOf(filteredRows[i - 1].livraisonIso) : null
              const showSep = prevU === null || prevU !== u
              const sepLabel =
                u === 'overdue' ? '⚠ En retard' : u === 'week' ? '◐ Cette semaine' : '○ À venir'
              const avancement = r.launched > 0 ? Math.min(100, Math.round((r.done / r.launched) * 100)) : 0
              return (
                <div key={`${r.posteCode}-${r.numOf}`}>
                  {showSep && (
                    <div
                      className={cn(
                        'flex items-center gap-2 px-7 pt-3 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider',
                        u === 'overdue' && 'text-danger',
                        u === 'week' && 'text-brand',
                        u === 'later' && 'text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-px flex-none w-4',
                          u === 'overdue' && 'bg-danger',
                          u === 'week' && 'bg-brand',
                          u === 'later' && 'bg-rule'
                        )}
                      />
                      {sepLabel}
                    </div>
                  )}
                  <div
                    className={cn(
                      'grid items-center gap-3 border-b border-rule-soft px-7 py-2 transition-colors hover:bg-secondary/50',
                      showPosteCol ? ROW_GRID_ALL : ROW_GRID_ONE
                    )}
                  >
                    {showPosteCol && (
                      <span className="truncate font-mono text-[11px] font-bold text-foreground">
                        {r.posteCode}
                      </span>
                    )}
                    <span className="truncate font-mono text-[12px] font-bold text-foreground">{r.numOf}</span>
                    <span className="truncate font-mono text-[11px] font-bold text-brand">{r.article}</span>
                    <span className="truncate text-[12px] text-foreground/80" title={r.designation ?? undefined}>
                      {r.designation ?? '—'}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="relative h-2.5 w-full">
                        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-rule-soft">
                          <div
                            className={cn(
                              'absolute inset-y-0 left-0 rounded-full',
                              avancement >= 100 && 'bg-ferme',
                              avancement > 0 && avancement < 100 && 'bg-planifie'
                            )}
                            style={{ width: `${avancement}%` }}
                          />
                        </div>
                      </div>
                      <span className="flex-none font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                        {r.done}/{r.launched}
                      </span>
                    </div>
                    <div className="min-w-0">
                      {r.commandes.length === 0 ? (
                        <span className="font-mono text-[11px] text-muted-foreground">—</span>
                      ) : (
                        r.commandes.map((c) => (
                          <div key={c.numCommande + (c.ligne ?? '')} className="min-w-0">
                            <div
                              className="flex items-center gap-1.5 overflow-hidden"
                              title={`${c.numCommande}${c.ligne ? `·L${c.ligne}` : ''}${c.client ? ` — ${c.client}` : ''}`}
                            >
                              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold leading-tight text-foreground">
                                {c.numCommande}
                              </span>
                              {c.ligne && (
                                <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-medium leading-tight text-muted-foreground">
                                  ·L{c.ligne}
                                </span>
                              )}
                            </div>
                            {c.client && (
                              <div className="truncate font-fraunces text-[10px] italic leading-tight text-muted-foreground">
                                {c.client}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                    <span className={cn('font-mono text-[11px] font-bold tabular-nums', urgencyColor(u))}>
                      {fmtDateFr(r.livraisonIso)}
                    </span>
                    <span className="text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                      {fmtH(r.hours)}
                    </span>
                    <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {fmtJ(r.hours)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
