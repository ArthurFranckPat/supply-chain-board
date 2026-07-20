import { useMemo } from 'react'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { ChargeHistogram, type ChargeWeek } from './charge-histogram'

/**
 * Board « Papier » — grille de planification (coquille, cellules vides).
 *
 * Une rangée par poste de production, le temps coule à l'horizontale (semaines
 * côte à côte). En-tête de poste = charge (ChargeHistogram : total + moyenne
 * h/sem + histogramme hebdo empilé Ferme/Planifié/Suggéré). Cellules vides sur
 * fond quadrillé, prêtes à recevoir les cartes commande.
 */

export type BoardDay = { short: string; num: string; today?: boolean; hours?: number }
export type BoardWeek = { label: string; span: number }
export type BoardLine = {
  code: string
  name: string
  tone?: string
  /** Charge par semaine (histogramme). */
  weekLoads?: ChargeWeek[]
}

export type BoardProps = {
  days: BoardDay[]
  weeks: BoardWeek[]
  lines: BoardLine[]
  /** Largeur de la colonne « Poste » (gelée à gauche). */
  labelWidth?: number
  class?: string
}

const GRAPH_PAPER =
  'linear-gradient(to right, rgba(31,26,19,.045) 1px, transparent 1px),' +
  'linear-gradient(to bottom, rgba(31,26,19,.045) 1px, transparent 1px)'

export function Board(props: BoardProps) {
  const lw = props.labelWidth ?? 210
  const cols = `${lw}px repeat(${props.days.length}, minmax(56px, 1fr))`
  const minWidth = `calc(${lw}px + ${props.days.length * 66}px)`

  /** Heures hebdo max (toutes lignes) = échelle des barres de charge. */
  const maxHours = useMemo(() => {
    let m = 0
    for (const l of props.lines) {
      for (const w of l.weekLoads ?? []) {
        const t = w.ferme + w.planifie + w.suggere
        if (t > m) m = t
      }
    }
    return m || 1
  }, [props.lines])

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(31,26,19,.05)]',
        props.class
      )}
    >
      <div style={{ minWidth: minWidth }}>
        {/* Bande de semaine (encre) */}
        <div className="grid" style={{ gridTemplateColumns: cols }}>
          <div className="bg-foreground" />
          {props.weeks.map((w) => (
            <div
              key={w.label}
              className="flex items-center gap-2 bg-foreground px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-secondary"
              style={{ gridColumn: `span ${w.span}` }}
            >
              {w.label}
            </div>
          ))}
        </div>

        {/* En-tête des jours */}
        <div className="grid border-b-2 border-foreground" style={{ gridTemplateColumns: cols }}>
          <div className="bg-secondary px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Poste de charge
          </div>
          {props.days.map((d, i) => (
            <div
              key={i}
              className={cn('bg-secondary px-1 py-1.5 text-center', d.today && 'bg-brand-soft')}
            >
              <div className="font-mono text-[9px] uppercase text-muted-foreground">{d.short}</div>
              <div
                className={cn(
                  'font-fraunces text-[15px] font-bold leading-none',
                  d.today ? 'text-brand' : 'text-foreground'
                )}
              >
                {d.num}
              </div>
              {d.hours != null && (
                <div className="mt-1 font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                  {d.hours}h
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Rangées de postes */}
        {props.lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <LayoutGrid size={28} strokeWidth={1.75} className="text-muted-foreground/60" />
            <div className="font-fraunces text-[15px] font-bold">Aucun poste à planifier</div>
            <div className="font-fraunces text-[13px] italic text-muted-foreground">
              Le board est vide sur cette fenêtre.
            </div>
          </div>
        ) : (
          props.lines.map((line) => (
            <div
              key={line.code}
              className="grid border-b border-rule-soft last:border-b-0"
              style={{ gridTemplateColumns: cols }}
            >
              {/* En-tête de poste : dot + code, nom, charge */}
              <div className="flex flex-col gap-2 border-r border-rule-soft bg-card px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-sm"
                    style={{ background: line.tone ?? 'var(--color-planifie)' }}
                  />
                  <span className="font-mono text-[12px] font-bold">{line.code}</span>
                </div>
                <span className="text-[10px] leading-tight text-muted-foreground">{line.name}</span>
                <ChargeHistogram weeks={line.weekLoads ?? []} maxHours={maxHours} />
              </div>

              {/* Cellules vides (quadrillé) */}
              {props.days.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    'border-r border-rule-soft last:border-r-0',
                    d.today && 'bg-brand-soft'
                  )}
                  style={{
                    minHeight: '150px',
                    backgroundImage: GRAPH_PAPER,
                    backgroundSize: '22px 22px',
                  }}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Board
