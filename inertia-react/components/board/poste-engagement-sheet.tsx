import { useState } from 'react'
import { CircleX, Package, RefreshCw, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@r/components/ui/sheet'
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

interface PosteEngagementSheetProps {
  /** Code du poste ouvert (null = fermé). */
  posteCode: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
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

export function PosteEngagementSheet(props: PosteEngagementSheetProps) {
  const [data, setData] = useState<EngagementPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch au mount + quand posteCode/open change
  useState(() => {
    if (props.open && props.posteCode) {
      setLoading(true)
      setError(null)
      fetch(route('scheduler.poste_engagement', { poste: props.posteCode }))
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<EngagementPayload>
        })
        .then((payload) => {
          setData(payload)
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Échec du chargement')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  })

  const sat = data ? saturation(data.totalHours, data.weeklyCapacityHours) : null
  const weeksEngaged = data && data.weeklyCapacityHours
    ? Math.round((data.totalHours / data.weeklyCapacityHours) * 10) / 10
    : null

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        className="theme-navy flex h-[72vh] w-full max-w-none flex-col gap-0 rounded-t-xl p-0"
      >
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <RefreshCw size={26} strokeWidth={1.75} className="animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-destructive">
            <CircleX size={26} strokeWidth={1.75} />
            <span className="text-sm font-medium">Échec du chargement de l'engagement.</span>
          </div>
        ) : !data ? null : (
          <>
            {/* Barre d'identité poste + saturation charge/capacité. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-5 py-3 pr-14">
              <Package size={18} strokeWidth={1.75} className="self-center text-brand" />
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[13px] font-bold text-foreground">
                  {data.poste.code}
                </span>
                <SheetTitle className="font-fraunces text-[14px] font-medium italic text-muted-foreground">
                  {data.poste.label}
                </SheetTitle>
              </div>
              <span className="flex-1" />
              {/* Métriques : OF count + heures + semaines engagées + jauge saturation. */}
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {data.count} OF
                </span>
                <span className="h-4 w-px bg-border" />
                <div className="flex items-baseline gap-1">
                  <span className="font-fraunces text-[17px] font-bold tabular-nums text-foreground">
                    {fmtH(data.totalHours)}
                  </span>
                  <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                    h
                  </span>
                  {weeksEngaged !== null && (
                    <span className="ml-1 font-mono text-[11px] font-semibold text-muted-foreground">
                      ≈ {fmtJ(data.totalHours)} j
                    </span>
                  )}
                </div>
                {/* Jauge saturation : affichée seulement si capacité connue. */}
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

            {data.x3Error && (
              <div className="flex flex-none items-start gap-2 border-b border-brand/30 bg-brand-soft px-5 py-2 text-[12px] text-foreground">
                <TriangleAlert size={16} strokeWidth={1.75} className="mt-px text-brand" />
                <span className="flex-none font-bold">Matching partiel :</span>
                <span className="font-mono break-all">{data.x3Error}</span>
              </div>
            )}

            {data.rows.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
                <Package size={26} strokeWidth={1.75} />
                <span className="font-fraunces text-[13px] italic">
                  Aucun OF ferme sur ce poste.
                </span>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                {/* En-tête tableau STICKY — reste visible au défilement. */}
                <div className="sticky top-0 z-10 grid grid-cols-[7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem] items-center gap-3 border-b border-border bg-secondary px-5 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  <span>OF</span>
                  <span>ARTICLE</span>
                  <span>DÉSIGNATION</span>
                  <span className="text-right">AVANCEMENT</span>
                  <span>COMMANDE(S)</span>
                  <span>LIVRAISON</span>
                  <span className="text-right">HEURES</span>
                  <span className="text-right">JOURS</span>
                </div>

                {/* Séparateur de groupe d'urgence. Les rows sont déjà triées par
                  urgence (loader) : on insère un séparateur quand l'urgence
                  change, avec un libellé explicite. Pas de collapse — on garde
                  un scan plat mais la structure saute aux yeux. */}
                {data.rows.map((r, i) => {
                  const u = urgencyOf(r.livraisonIso)
                  const prevU = i > 0 ? urgencyOf(data.rows[i - 1].livraisonIso) : null
                  const showSep = prevU === null || prevU !== u
                  const sepLabel =
                    u === 'overdue'
                      ? '⚠ En retard'
                      : u === 'week'
                        ? '◐ Cette semaine'
                        : '○ À venir'
                  const avancement =
                    r.launched > 0
                      ? Math.min(100, Math.round((r.done / r.launched) * 100))
                      : 0
                  return (
                    <div key={r.numOf}>
                      {showSep && (
                        <div
                          className={cn(
                            'flex items-center gap-2 px-5 pt-3 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-wider',
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
                      <div className="grid grid-cols-[7rem_6.5rem_1.5fr_6rem_1.3fr_5.5rem_4rem_4rem] items-center gap-3 border-b border-rule-soft px-5 py-2 transition-colors hover:bg-secondary/50">
                        <span className="truncate font-mono text-[12px] font-bold text-foreground">
                          {r.numOf}
                        </span>
                        <span className="truncate font-mono text-[11px] font-bold text-brand">
                          {r.article}
                        </span>
                        <span
                          className="truncate text-[12px] text-foreground/80"
                          title={r.designation ?? undefined}
                        >
                          {r.designation ?? '—'}
                        </span>
                        {/* Avancement : micro-jauge done/launched. La barre est
                          calée dans une boîte h-2.5 pour aligner son centre
                          sur le milieu x-height du texte — sinon la barre (h-1)
                          paraît flotter sous le texte 10px. Parité avec la jauge
                          saturation du header (mêmes dimensions h-1 / track). */}
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
                        {/* Commande(s) — parité board-card.tsx : cmd en mono gras,
                          ·ligne en mono medium muted (séparés, shrink-0), client
                          en fraunces italic sur sa propre ligne. items-center
                          (pas baseline) pour aligner les boîtes indépendamment
                          des tailles de police. */}
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
                        <span
                          className={cn(
                            'font-mono text-[11px] font-bold tabular-nums',
                            urgencyColor(u)
                          )}
                        >
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
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default PosteEngagementSheet
