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
 *
 * ⚠️ Paliers et semaines partagent UNE SEULE grille (`gridColumn: span`), jamais
 * deux conteneurs alignés « à peu près » : en flex proportionnel, les gouttières
 * ne se répartissent pas pareil sur 3 blocs et sur 12 colonnes, et un palier se
 * retrouve dessiné au-dessus de semaines qu'il ne couvre pas. La frise disait
 * alors précisément le contraire de ce qu'elle calcule.
 */

/**
 * Couleur d'état d'une semaine. L'état est celui du PALIER (verdict cumulé) ;
 * le remplissage de la barre, lui, est le taux de la semaine seule. Les deux
 * doivent rester distincts : une semaine à 117 % dans un palier qui tient n'est
 * pas un retard, c'est du lissage.
 */
const STATE_STYLE: Record<ShiftWeekState, { fill: string; label: string }> = {
  tenu: { fill: 'bg-emerald-500', label: 'palier tenu' },
  sous_charge: { fill: 'bg-muted-foreground/40', label: 'capacité en excès sur le palier' },
  retard: { fill: 'bg-red-500', label: 'palier en retard' },
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
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }
  const currentLabel =
    payload.catalog.find((s) => s.code === line.current)?.label ?? line.current ?? '—'

  return (
    <div className="mt-3 flex-none rounded-lg border border-rule bg-card p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-fraunces text-[15px] font-extrabold tracking-tight">
          Organisation du poste
        </h3>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          schéma actuel <span className="font-semibold text-foreground">{currentLabel}</span>
          {' · '}
          {switches === 0 ? 'aucun changement' : `${switches} changement${switches > 1 ? 's' : ''}`}
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-snug text-muted-foreground">
        Schéma horaire à tenir sur {n} semaines, par paliers de 3 minimum, calculé sur le reste à
        produire. Chaque palier couvre exactement les semaines situées sous lui, et le taux d’une
        semaine se lit <span className="text-foreground">sous le schéma de son propre palier</span>{' '}
        — deux paliers différents ne se comparent donc pas sur le pourcentage.
      </p>

      {/* Paliers ET semaines dans la MÊME grille : le bloc couvre ses colonnes. */}
      <div className="grid gap-1" style={cols}>
        {plateaus.map((p) => {
          const span = p.to - p.from + 1
          const inDebt = p.debtHours > 0
          const load = weeks.slice(p.from, p.to + 1).reduce((sum, w) => sum + w.load, 0)
          return (
            <div
              key={p.from}
              style={{ gridColumn: `span ${span} / span ${span}` }}
              className={cn(
                'min-w-0 rounded-md border px-3 py-2',
                inDebt ? 'border-red-500/40 bg-red-500/5' : 'border-rule bg-secondary'
              )}
              title={`Semaines du ${payload.weekKeys[p.from]} au ${payload.weekKeys[p.to]}`}
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
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {p.schedule.crews} équipe{p.schedule.crews > 1 ? 's' : ''} · {p.schedule.openDays} j
                {' · '}
                {load <= 0 ? (
                  <span>aucune charge sur ces semaines</span>
                ) : inDebt ? (
                  <span className="font-semibold text-red-600">ne tient pas {p.debtHours} h</span>
                ) : (
                  <span>
                    {Math.round(load)} h à produire
                    {p.idleHours > 0 && ` · ${p.idleHours} h de marge`}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {/* Semaines — la répartition de la charge à l'intérieur des paliers. */}
        {weeks.map((w) => {
          const rate = w.capacity > 0 ? Math.round((w.load / w.capacity) * 100) : 0
          const st = STATE_STYLE[w.state]
          const over = rate > 100
          return (
            <div
              key={w.index}
              className="min-w-0 rounded border border-rule/60 px-1 py-1 text-center"
              title={`Semaine du ${payload.weekKeys[w.index]} — ${Math.round(w.load)} h à produire pour ${Math.round(w.capacity)} h ouvertes en ${w.crewDays} équipes-jour · ${st.label}`}
            >
              <div className="font-mono text-[9px] text-muted-foreground">
                {weekLabel(payload.weekKeys[w.index] ?? '')}
              </div>
              <div
                className={cn(
                  'font-mono text-[11px] font-semibold tabular-nums',
                  over && 'text-amber-600'
                )}
              >
                {w.capacity > 0 ? `${rate}%` : '—'}
              </div>
              {/* Jauge : le REMPLISSAGE est le taux de la semaine, la COULEUR le verdict du palier. */}
              <div className="mx-auto mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted-foreground/15">
                <div
                  className={cn('h-full rounded-full', st.fill)}
                  style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground">
        <span>barre = charge de la semaine / capacité ouverte</span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-4 rounded-full bg-emerald-500" /> palier tenu
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-4 rounded-full bg-muted-foreground/40" /> capacité en excès
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1 w-4 rounded-full bg-red-500" /> palier en retard
        </span>
        <span className="text-amber-600">au-delà de 100 % : absorbé ailleurs dans le palier</span>
      </div>

      {/* Effectif de l'atelier : la somme, parce que c'est elle qu'on recrute. */}
      <div className="mt-3 border-t border-rule pt-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {atelierLabel} · équipes-jour par semaine (tous postes planifiés)
        </div>
        <div className="grid gap-1" style={cols}>
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
