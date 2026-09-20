import { useMemo } from 'react'
import { cn } from '@r/lib/utils'
import type { ShiftPlanLine, ShiftPlanPayload } from '@r/lib/load/types'

/**
 * « Organisation du poste » — le schéma horaire à tenir sur l'horizon de décision.
 *
 * ⚠️ Deux versions ont été rejetées avant celle-ci, pour des raisons qui doivent
 * rester écrites :
 *
 * 1. Une FRISE (paliers + taux de saturation semaine par semaine). Le graphe
 *    juste au-dessus montre déjà charge et capacité : elle redisait en petit ce
 *    qui est lisible en grand, prenait la moitié du panneau, et un taux de
 *    saturation ne dit rien à quelqu'un qui staffe des équipes.
 * 2. Une LISTE de décisions sur douze semaines. L'horizon de décision est de
 *    TROIS semaines : proposer une organisation pour dans six semaines n'intéresse
 *    personne, elle aura été recalculée cinq fois d'ici là.
 *
 * Donc : une décision, une phrase. Verbe, période, effectif, puis le chiffre qui
 * justifie le geste. Si l'envie revient d'y mettre un dessin ou un horizon plus
 * long, c'est le graphe au-dessus qu'il faut corriger, pas ce bloc.
 */

const DAY_MS = 86_400_000

/** « 19/10 » à partir d'un lundi ISO, décalé de `plusDays` jours. */
const fmt = (iso: string, plusDays = 0): string => {
  const x = new Date(new Date(`${iso}T12:00:00`).getTime() + plusDays * DAY_MS)
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
}

const hours = (h: number): string => `${Math.round(h)} h`

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

  // Équipes-jour de tout l'atelier, semaine par semaine : ce qu'il faut staffer
  // si tous les postes suivent leur proposition. Deux postes qui basculent en
  // sens inverse laissent ce total plat — ça ne se voit que sur la somme.
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
      <div className="mt-3 flex-none rounded-lg border border-dashed border-rule px-4 py-2.5 text-[12px] text-muted-foreground">
        {skip?.reason === 'hors_catalogue'
          ? 'Schéma horaire X3 hors catalogue (semaine trouée ou feu continu) : ce poste garde ' +
            'sa capacité X3 telle quelle — l’arrondir en équipes en fausserait la lecture.'
          : 'Aucune charge sur l’horizon : rien à organiser.'}
      </div>
    )
  }

  const currentLabel =
    payload.catalog.find((s) => s.code === line.current)?.label ?? line.current ?? '—'
  const currentCrews = payload.catalog.find((s) => s.code === line.current)?.crews ?? null

  return (
    <div className="mt-3 flex-none rounded-lg border border-rule bg-card px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-fraunces text-[15px] font-extrabold tracking-tight">
          Organisation du poste
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          aujourd’hui <span className="font-semibold text-foreground">{currentLabel}</span>
        </span>
      </div>

      <div className="space-y-2.5">
        {line.plan.plateaus.map((p, idx) => {
          // Le premier palier se compare au schéma X3 du poste, les suivants au
          // palier d'avant : même règle, une seule lecture.
          const prevLabel = idx === 0 ? currentLabel : line.plan.plateaus[idx - 1].schedule.label
          const prevCrews = idx === 0 ? currentCrews : line.plan.plateaus[idx - 1].schedule.crews
          const same = idx === 0 && line.current === p.schedule.code
          const delta = prevCrews === null ? 0 : p.schedule.crews - prevCrews
          const up = delta > 0
          const span = p.to - p.from + 1
          const crew = atelierCrewDays.slice(p.from, p.to + 1)
          const crewLo = Math.min(...crew)
          const crewHi = Math.max(...crew)

          return (
            <div key={p.from}>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  className={cn(
                    'font-fraunces text-[16px] font-extrabold tracking-tight',
                    p.debtHours > 0 && 'text-red-700'
                  )}
                >
                  {same
                    ? `Garder le ${p.schedule.label}`
                    : delta === 0
                      ? `Réorganiser la semaine en ${p.schedule.label}`
                      : up
                        ? `Passer en ${p.schedule.label}`
                        : `Revenir en ${p.schedule.label}`}
                </span>
                {delta !== 0 && (
                  <span
                    className={cn(
                      'rounded-full px-2 py-px font-mono text-[11px] font-semibold',
                      up ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700'
                    )}
                  >
                    {delta > 0 ? `+${delta}` : delta} équipe{Math.abs(delta) > 1 ? 's' : ''}
                  </span>
                )}
                <span className="font-mono text-[11px] text-muted-foreground">
                  du lundi {fmt(payload.weekKeys[p.from] ?? '')} au dimanche{' '}
                  {fmt(payload.weekKeys[p.to] ?? '', 6)} · {span} semaine{span > 1 ? 's' : ''}
                </span>
              </div>

              <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {hours(p.loadHours)} à produire
                </span>{' '}
                pour {hours(p.capacityHours)} ouvertes.
                {!same && p.keepHours !== null && (
                  <>
                    {' '}
                    En restant en {prevLabel}, vous n’en ouvrez que {hours(p.keepHours)}.
                  </>
                )}
                {p.debtHours > 0 && (
                  <span className="font-semibold text-red-700">
                    {' '}
                    Il manque {hours(p.debtHours)} : aucun schéma autorisé ne tient cette charge, le
                    retard glissera.
                  </span>
                )}
                {crew.length > 0 && crewHi > 0 && (
                  <>
                    {' '}
                    Atelier {atelierLabel} : {crewLo === crewHi ? crewLo : `${crewLo} à ${crewHi}`}{' '}
                    équipes-jour par semaine, tous postes planifiés.
                  </>
                )}
              </p>
            </div>
          )
        })}
      </div>

      <p className="mt-2 border-t border-rule pt-1.5 font-mono text-[10px] text-muted-foreground">
        Reste à produire · lissé sur l’horizon, pas semaine par semaine — une semaine creuse suivie
        d’un pic se tient avec un seul schéma.
      </p>
    </div>
  )
}
