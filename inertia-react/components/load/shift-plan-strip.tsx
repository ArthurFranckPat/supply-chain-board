import { useMemo } from 'react'
import { cn } from '@r/lib/utils'
import type { ShiftPlanLine, ShiftPlanPayload, ShiftWeekState } from '@r/lib/load/types'

/**
 * Frise « Organisation du poste » — le schéma horaire proposé semaine par semaine
 * sur l'horizon court (lot 1, lecture seule).
 *
 * Le livrable visuel n'est pas la colonne, c'est le PALIER : un 2×8 tenu trois
 * semaines doit se lire comme un bloc continu, pas comme trois cases identiques
 * qu'on recompose à l'œil. C'est le bloc qui dit au responsable d'atelier ce
 * qu'il annonce à ses équipes ; la rangée de semaines en dessous ne fait que
 * montrer comment la charge se répartit à l'intérieur.
 */

/** Couleur d'état d'une semaine. `sous_charge` n'est pas une alerte : le palier tient. */
const STATE_STYLE: Record<ShiftWeekState, { dot: string; label: string }> = {
  tenu: { dot: 'bg-emerald-500', label: 'Tenu' },
  sous_charge: { dot: 'bg-muted-foreground/40', label: 'Sous-charge' },
  retard: { dot: 'bg-red-500', label: 'Retard' },
}

/** Libellé court d'une semaine ISO : « 22/09 ». */
const weekLabel = (iso: string): string => {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

export interface ShiftPlanStripProps {
  payload: ShiftPlanPayload
  /** Plans de la vue courante (OF ou commande), indexés par poste. */
  lines: ShiftPlanLine[]
  /** Poste affiché dans le panneau de détail. */
  code: string
  /** Postes du même atelier, pour le cumul d'effectif. */
  atelierCodes: string[]
  atelierLabel: string
}

export function ShiftPlanStrip({
  payload,
  lines,
  code,
  atelierCodes,
  atelierLabel,
}: ShiftPlanStripProps) {
  const line = useMemo(() => lines.find((l) => l.code === code), [lines, code])

  // Équipes-jour de tout l'atelier, semaine par semaine : ce que le responsable
  // staffe réellement. Deux postes qui basculent en sens inverse la même semaine
  // laissent ce total plat — c'est une bonne nouvelle, et elle ne se voit que
  // sur la somme.
  const atelierCrewDays = useMemo(() => {
    const total = payload.weekKeys.map(() => 0)
    for (const l of lines) {
      if (!atelierCodes.includes(l.code)) continue
      for (const w of l.plan.weeks) total[w.index] += w.crewDays
    }
    return total
  }, [lines, atelierCodes, payload.weekKeys])

  if (!line) {
    const skip = payload.skipped.find((s) => s.code === code)
    return (
      <div className="mt-3 flex-none rounded-lg border border-dashed border-rule px-4 py-3 text-[12px] text-muted-foreground">
        {skip?.reason === 'hors_catalogue'
          ? 'Schéma horaire X3 hors catalogue (semaine trouée ou feu continu) : ce poste garde ' +
            'sa capacité X3 telle quelle — l’arrondir en équipes en fausserait la lecture.'
          : 'Aucune charge sur les douze prochaines semaines : rien à organiser.'}
      </div>
    )
  }

  const { plateaus, weeks, switches } = line.plan
  const n = payload.weekKeys.length
  const currentLabel =
    payload.catalog.find((s) => s.code === line.current)?.label ?? line.current ?? '—'

  return (
    <div className="mt-3 flex-none rounded-lg border border-rule bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-fraunces text-[15px] font-extrabold tracking-tight">
          Organisation du poste
        </h3>
        <span className="text-[12px] text-muted-foreground">
          {n} semaines · paliers de 3 minimum · calculé sur le reste à produire
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          schéma actuel <span className="font-semibold text-foreground">{currentLabel}</span>
          {' · '}
          {switches === 0 ? 'aucun changement' : `${switches} changement${switches > 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Paliers — largeur proportionnelle à leur durée. */}
      <div className="flex gap-1.5">
        {plateaus.map((p) => {
          const span = p.to - p.from + 1
          const inDebt = p.debtHours > 0
          return (
            <div
              key={p.from}
              style={{ flexGrow: span, flexBasis: 0 }}
              className={cn(
                'min-w-0 rounded-md border px-3 py-2',
                inDebt ? 'border-red-500/40 bg-red-500/5' : 'border-rule bg-secondary'
              )}
              title={`${payload.weekKeys[p.from]} → ${payload.weekKeys[p.to]}`}
            >
              <div className="flex items-baseline gap-2">
                <span className="truncate font-fraunces text-[14px] font-extrabold tracking-tight">
                  {p.schedule.label}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{span} sem.</span>
                {p.frozen && (
                  <span
                    className="rounded-full border border-rule px-1.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                    title="Préavis : les premières semaines gardent le schéma actuel — on ne change pas l’organisation d’un atelier pour lundi prochain."
                  >
                    préavis
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                {p.schedule.crews} équipe{p.schedule.crews > 1 ? 's' : ''} · {p.schedule.openDays} j
                {inDebt && (
                  <span className="ml-1.5 font-semibold text-red-600">
                    ne tient pas {p.debtHours} h
                  </span>
                )}
                {!inDebt && p.idleHours > 0 && (
                  <span className="ml-1.5">· {p.idleHours} h à vide</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Semaines — la répartition de la charge à l'intérieur des paliers. */}
      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {weeks.map((w) => {
          const rate = w.capacity > 0 ? Math.round((w.load / w.capacity) * 100) : 0
          const st = STATE_STYLE[w.state]
          return (
            <div
              key={w.index}
              className="min-w-0 rounded border border-rule/60 px-1 py-1 text-center"
              title={`${payload.weekKeys[w.index]} · ${w.load} h de charge / ${w.capacity} h de capacité · ${st.label}`}
            >
              <div className="font-mono text-[9px] text-muted-foreground">
                {weekLabel(payload.weekKeys[w.index] ?? '')}
              </div>
              <div className="font-mono text-[11px] font-semibold tabular-nums">
                {w.capacity > 0 ? `${rate}%` : '—'}
              </div>
              <div className={cn('mx-auto mt-0.5 h-1 w-full rounded-full', st.dot)} />
            </div>
          )
        })}
      </div>

      {/* Effectif de l'atelier : la somme, parce que c'est elle qu'on recrute. */}
      <div className="mt-3 border-t border-rule pt-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {atelierLabel} · équipes-jour par semaine (tous postes planifiés)
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {atelierCrewDays.map((c, i) => (
            <div
              key={payload.weekKeys[i]}
              className="rounded bg-secondary py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums"
              title={`Semaine du ${payload.weekKeys[i]} — ${c} équipes-jour à staffer sur l’atelier`}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
