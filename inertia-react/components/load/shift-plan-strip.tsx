import { useMemo } from 'react'
import { cn } from '@r/lib/utils'
import type { ShiftPlanLine, ShiftPlanPayload, ShiftPlateau } from '@r/lib/load/types'

/**
 * « Organisation du poste » — ce que le responsable d'atelier doit FAIRE, et quand.
 *
 * ⚠️ Ce bloc n'est pas une visualisation. La première version en était une (frise
 * de paliers + taux de saturation semaine par semaine) et elle a été rejetée pour
 * la bonne raison : le graphe juste au-dessus montre déjà charge et capacité, donc
 * elle redisait en petit ce qui est lisible en grand, prenait la moitié de l'écran,
 * et ne répondait pas à la seule question posée — « qu'est-ce que je change, quand,
 * et pourquoi ». Un taux de saturation ne dit rien à quelqu'un qui staffe des
 * équipes : il faut une date, un verbe, et le nombre d'heures qui justifie le geste.
 *
 * Donc : une liste de décisions. Pas de pourcentage, pas de barre, pas de frise.
 * Si on est tenté d'y remettre un dessin, c'est que le graphe au-dessus manque de
 * quelque chose — c'est lui qu'il faut corriger.
 */

const DAY_MS = 86_400_000

/** « 19/10 » à partir d'un lundi ISO, décalé de `plusDays` jours. */
const fmt = (iso: string, plusDays = 0): string => {
  const d = new Date(`${iso}T12:00:00`)
  const x = new Date(d.getTime() + plusDays * DAY_MS)
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
}

const hours = (h: number): string => `${Math.round(h)} h`

const weeksLabel = (p: ShiftPlateau): string => {
  const n = p.to - p.from + 1
  return `${n} semaine${n > 1 ? 's' : ''}`
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

  // Équipes-jour de tout l'atelier, semaine par semaine. Affichées seulement AU
  // MOMENT d'un changement : c'est là qu'elles servent — savoir si la bascule
  // d'un poste tombe en même temps que celle des voisins.
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
          : 'Aucune charge sur les douze prochaines semaines : rien à organiser.'}
      </div>
    )
  }

  const { plateaus } = line.plan
  const currentLabel =
    payload.catalog.find((s) => s.code === line.current)?.label ?? line.current ?? '—'
  const first = plateaus[0]
  const changes = plateaus.slice(1)
  const lastKey = payload.weekKeys.at(-1) ?? ''

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

      <ol className="space-y-1.5 text-[12.5px] leading-snug">
        {/* Premier palier : on ne change rien, et on dit jusqu'à quand. */}
        {first && (
          <li className="flex gap-2.5">
            <span className="mt-[3px] h-1.5 w-1.5 flex-none rounded-full bg-muted-foreground/40" />
            <span>
              <span className="font-semibold">Ne rien changer</span> jusqu’au{' '}
              {fmt(payload.weekKeys[first.to] ?? '', 6)}
              {changes.length === 0 && ' (fin de l’horizon)'} — {first.schedule.label},{' '}
              {hours(first.loadHours)} à produire pour {hours(first.capacityHours)} ouvertes.
              {first.debtHours > 0 && (
                <span className="font-semibold text-red-600">
                  {' '}
                  Il manque {hours(first.debtHours)} : le retard glissera, le schéma actuel ne les
                  rattrape pas.
                </span>
              )}
            </span>
          </li>
        )}

        {/* Les décisions. Verbe, date, effectif, puis le chiffre qui les justifie. */}
        {changes.map((p) => {
          const prev = plateaus[plateaus.indexOf(p) - 1]
          const delta = p.schedule.crews - prev.schedule.crews
          const up = delta > 0
          const before = atelierCrewDays[p.from - 1] ?? 0
          const after = atelierCrewDays[p.from] ?? 0
          const isLast = p.to === payload.weekKeys.length - 1
          return (
            <li key={p.from} className="flex gap-2.5">
              <span
                className={cn(
                  'mt-[3px] h-1.5 w-1.5 flex-none rounded-full',
                  delta === 0 ? 'bg-muted-foreground/40' : up ? 'bg-amber-500' : 'bg-emerald-500'
                )}
              />
              <span>
                <span className="font-semibold">
                  {delta === 0
                    ? `Réorganiser la semaine en ${p.schedule.label}`
                    : up
                      ? `Passer en ${p.schedule.label}`
                      : `Revenir en ${p.schedule.label}`}
                </span>{' '}
                le lundi {fmt(payload.weekKeys[p.from] ?? '')}, pendant {weeksLabel(p)}
                {isLast
                  ? ` (jusqu’à la fin de l’horizon, ${fmt(lastKey, 6)})`
                  : ` (jusqu’au ${fmt(payload.weekKeys[p.to] ?? '', 6)})`}
                {delta !== 0 && (
                  <span className={cn('font-semibold', up ? 'text-amber-700' : 'text-emerald-700')}>
                    {' · '}
                    {delta > 0 ? `+${delta}` : delta} équipe{Math.abs(delta) > 1 ? 's' : ''}
                  </span>
                )}
                {'. '}
                <span className="text-muted-foreground">
                  {hours(p.loadHours)} à produire
                  {p.keepHours !== null &&
                    (up
                      ? ` ; en restant en ${prev.schedule.label} vous n’en ouvrez que ${hours(p.keepHours)}.`
                      : ` ; le ${prev.schedule.label} en ouvrirait ${hours(p.keepHours)}.`)}
                  {before > 0 && after !== before && (
                    <>
                      {' '}
                      Atelier {atelierLabel} : {before} → {after} équipes-jour cette semaine-là.
                    </>
                  )}
                </span>
                {p.debtHours > 0 && (
                  <span className="font-semibold text-red-600">
                    {' '}
                    Même ainsi il manque {hours(p.debtHours)}.
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="mt-2 border-t border-rule pt-1.5 font-mono text-[10px] text-muted-foreground">
        Calculé sur le reste à produire, {payload.weekKeys.length} semaines, paliers de 3 minimum —
        un schéma se tient, il ne se change pas d’une semaine sur l’autre.
      </p>
    </div>
  )
}
