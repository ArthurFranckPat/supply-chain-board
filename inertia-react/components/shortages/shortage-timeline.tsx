/**
 * Vue R3 « Couverture » du suivi des ruptures (port React) : frise temporelle —
 * réception couvrante ↔ date d'expédition, pour lire d'un coup le retard
 * d'arrivée (gap hachuré) ou la marge.
 *
 * Le positionnement temporel (offsetPct) et les prédicats verdict (isLate,
 * isAtRisk) sont des dérivations pures (lib/shortages/shortage-math.ts).
 * `Marker` est un helper privé à la frise (pastille + libellé).
 */
import { useMemo, type ReactNode } from 'react'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cn } from '@r/lib/utils'
import { isAtRisk, isLate, offsetPct } from '@/lib/shortages/shortage-math'

export function ShortageTimeline({
  rows,
  windowStartIso,
  horizon,
  onSelectOf,
  emptyState,
}: {
  rows: ShortageDisplayRow[]
  windowStartIso: string
  horizon: number
  onSelectOf: (numOf: string) => void
  emptyState: ReactNode
}) {
  // Repères de semaine (lundis) sur la fenêtre — uniquement pour la grille de fond.
  const weekTicks = useMemo(() => {
    const ticks: { pct: number; label: string }[] = []
    const start = new Date(`${windowStartIso}T00:00:00Z`)
    for (let d = 0; d <= horizon; d++) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + d)
      if (day.getUTCDay() === 1) {
        // Lundi → numéro de semaine ISO approximatif (affichage seulement).
        const jan1 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
        const wk = Math.ceil(
          ((day.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7
        )
        ticks.push({ pct: (d / horizon) * 100, label: `S${wk}` })
      }
    }
    return ticks
  }, [windowStartIso, horizon])

  // ISO local (pas toISOString : UTC recule d'un jour entre minuit et 1-2h en UTC+1/+2).
  const todayPct = useMemo(() => {
    const d = new Date()
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return offsetPct(iso, windowStartIso, horizon)
  }, [windowStartIso, horizon])

  if (rows.length === 0) {
    return (
      <div className="h-full overflow-auto rounded-none border-0 bg-card">{emptyState}</div>
    )
  }

  return (
    <div className="h-full overflow-auto rounded-none border-0 bg-card">
      <div className="min-w-[980px]">
        {rows.map((row) => {
          const expPct = offsetPct(row.dateExpeditionIso, windowStartIso, horizon)
          const recPct = offsetPct(row.receptionIso, windowStartIso, horizon)
          let gap: { left: number; width: number; state: 'bad' | 'warn' | 'ok' } | null = null
          if (expPct !== null && recPct !== null) {
            const state = row.arriveeLate ? 'bad' : isAtRisk(row) ? 'warn' : 'ok'
            gap = { left: Math.min(expPct, recPct), width: Math.abs(recPct - expPct), state }
          }

          return (
            <div
              key={`${row.numOf}-${row.component}`}
              className={cn(
                'grid grid-cols-[330px_1fr] border-b border-rule-soft transition-colors',
                isLate(row)
                  ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
                  : 'hover:bg-foreground/[0.04]'
              )}
            >
              {/* Contexte */}
              <div
                className={cn(
                  'flex flex-col gap-0.5 border-r border-rule-soft px-4 py-[13px]',
                  isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]'
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[14px] font-bold text-foreground">
                    {row.component}
                  </span>
                  <span
                    className={cn(
                      'ml-auto font-mono text-[11px] font-semibold',
                      isLate(row) ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    −{row.qteManquante} u
                  </span>
                </div>
                <div className="truncate font-sans text-[11px] text-muted-foreground">
                  {row.componentDesc}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => onSelectOf(row.numOf)}
                    className="cursor-pointer font-semibold text-brand hover:underline"
                  >
                    {row.numOf}
                  </button>
                  {' · '}
                  <span className="font-semibold">{row.articleParent}</span>
                  {' · '}
                  {row.hasCommande ? `${row.numCommande} · ${row.client}` : 'orphelin'}
                </div>
              </div>

              {/* Frise */}
              <div className="relative mx-3.5 my-2.5 h-[46px]">
                {/* Grille semaines */}
                {weekTicks.map((t) => (
                  <div
                    key={t.label}
                    className="absolute bottom-4 top-0 w-px bg-hair"
                    style={{ left: `${t.pct}%` }}
                  >
                    <span className="absolute -top-0.5 left-1 font-mono text-[8px] font-bold tracking-wide text-muted-foreground/70">
                      {t.label}
                    </span>
                  </div>
                ))}
                {/* Axe */}
                <div className="absolute left-0 right-0 top-6 h-0.5 bg-rule-soft" />
                {/* Aujourd'hui */}
                {todayPct !== null && (
                  <div
                    className="absolute bottom-3.5 top-0 w-0.5 bg-brand/50"
                    style={{ left: `${todayPct}%` }}
                  >
                    <span className="absolute -top-0.5 left-1 font-mono text-[8px] font-bold text-brand">
                      auj.
                    </span>
                  </div>
                )}
                {/* Gap réception ↔ expé */}
                {gap && (
                  <div
                    className={cn(
                      'absolute top-[21px] h-2 rounded-full border',
                      gap.state === 'bad'
                        ? 'border-destructive/35 [background:repeating-linear-gradient(45deg,var(--color-destructive)/10,var(--color-destructive)/10_5px,transparent_5px,transparent_10px)]'
                        : gap.state === 'warn'
                          ? 'border-suggere/40 bg-suggere/15'
                          : 'border-ferme/30 bg-ferme/15'
                    )}
                    style={{ left: `${gap.left}%`, width: `${gap.width}%` }}
                  />
                )}
                {/* Marqueur expé */}
                {expPct !== null && <Marker pct={expPct} tone="exp" cap={`expé ${row.dateExpedition}`} />}
                {/* Marqueur réception (ou absence) */}
                {row.receptionIso ? (
                  <Marker
                    pct={recPct!}
                    tone={row.arriveeLate ? 'bad' : isAtRisk(row) ? 'warn' : 'ok'}
                    cap={row.dateArrivee}
                    sub={
                      row.verdictKey === 'retard'
                        ? `retard +${row.joursRetardReception}j`
                        : row.verdictKey === 'a_risque'
                          ? `marge ${row.joursMarge}j`
                          : undefined
                    }
                  />
                ) : row.verdictKey === 'sous_ensemble' ? (
                  <Marker
                    pct={88}
                    tone="se"
                    cap="sous-ensemble"
                    sub={
                      row.sousEnsembleOfs.length > 0
                        ? `OF fils ${row.sousEnsembleOfs[0]}`
                        : 'OF fils à lancer'
                    }
                    dashed
                  />
                ) : (
                  <Marker pct={88} tone="none" cap="aucune réception" sub="à commander" dashed />
                )}
              </div>
            </div>
          )
        })}

        {/* Légende */}
        <div className="flex flex-wrap gap-4 border-t border-rule-soft bg-card px-4 py-2.5 font-mono text-[10px] font-semibold text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand" /> Date d'expédition (cible)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-ferme" /> Réception à temps
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-suggere" /> À risque (buffers entamés)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-destructive" /> Retard client
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-dashed border-destructive" />{' '}
            Aucune réception
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full border-2 border-dashed border-planifie" />{' '}
            Sous-ensemble (OF fils)
          </span>
        </div>
      </div>
    </div>
  )
}

/** Marqueur de frise (pastille + libellé + sous-libellé), positionné en %. */
function Marker({
  pct,
  tone,
  cap,
  sub,
  dashed,
}: {
  pct: number
  tone: 'exp' | 'ok' | 'bad' | 'warn' | 'none' | 'se'
  cap: string
  sub?: string
  dashed?: boolean
}) {
  const pinCls =
    tone === 'exp'
      ? 'bg-brand'
      : tone === 'ok'
        ? 'bg-ferme'
        : tone === 'bad'
          ? 'bg-destructive'
          : tone === 'warn'
            ? 'bg-suggere'
            : tone === 'se'
              ? 'border-2 border-dashed border-planifie'
              : 'border-2 border-dashed border-destructive'
  const capCls =
    tone === 'exp'
      ? 'text-brand'
      : tone === 'ok'
        ? 'text-ferme'
        : tone === 'warn'
          ? 'text-suggere'
          : tone === 'se'
            ? 'text-planifie'
            : 'text-destructive'
  return (
    <div
      className="absolute top-3.5 flex -translate-x-1/2 flex-col items-center gap-0.5"
      style={{ left: `${pct}%` }}
    >
      <span className={cn('size-[13px] rounded-full border-2 border-card', pinCls)} />
      <span className={cn('mt-0.5 whitespace-nowrap font-mono text-[9px] font-bold', capCls)}>
        {cap}
      </span>
      {sub && (
        <span className="whitespace-nowrap font-mono text-[8px] font-medium text-muted-foreground">
          {sub}
        </span>
      )}
    </div>
  )
}

export default ShortageTimeline
