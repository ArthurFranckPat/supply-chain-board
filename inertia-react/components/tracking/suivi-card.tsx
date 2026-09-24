/**
 * Cartes mobiles du Suivi (< md) — remplacent la table de 1 300 px.
 *
 * Hiérarchie : qui (commande · client) et le verdict en tête, quoi (article),
 * puis une seule ligne de faits (qté, expédition, retard) et, seulement s'il
 * existe, le pourquoi (cause / composants en rupture). Type, poste, MAD max,
 * couverture et charge restent dans le panneau de détail, ouvert au toucher.
 */
import type { ReactNode } from 'react'
import { FlaskConical } from 'lucide-react'

import { cn } from '@r/lib/utils'
import type { ProactiveDisplayRow, SuiviDisplayRow } from '@r/lib/suivi/types'
import { BADGE_TONE, getRelativeDateLabel } from '@r/lib/suivi/tracking-shared'
import { delayTone, feasibilityTone } from '@r/lib/suivi/proactive-columns'

function CardHead(props: {
  numCommande: string
  client: string
  article: string
  designation: string
  badge: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-bold tracking-tight text-foreground">
            {props.numCommande}
          </span>
          <span className="truncate text-xs text-muted-foreground">{props.client || '—'}</span>
        </div>
        <div className="mt-1 truncate text-[13px] text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{props.article}</span>
          {props.designation && <> · {props.designation}</>}
        </div>
      </div>
      <div className="flex-none">{props.badge}</div>
    </div>
  )
}

function Facts(props: {
  qty: number
  dateExp: string
  dateExpIso: string | null
  refDate: string
  extra?: ReactNode
}) {
  const rel = getRelativeDateLabel(props.dateExpIso, props.refDate)
  const late = rel?.label.startsWith('Retard') || rel?.label === 'Hier'
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      <span>
        <span className="font-semibold tabular-nums text-foreground">{props.qty}</span> u
      </span>
      <span>
        Expé <span className="font-mono font-semibold text-foreground">{props.dateExp || '—'}</span>
        {rel && (
          <span
            className={cn(
              'ml-1.5 font-semibold',
              late ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {late ? rel.label.replace('Retard -', 'retard ') : rel.label}
          </span>
        )}
      </span>
      {props.extra}
    </div>
  )
}

function Why(props: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-md bg-muted/70 px-3 py-2 text-[13px] leading-snug text-secondary-foreground">
      {props.children}
    </div>
  )
}

const CqTag = () => (
  <span className="inline-flex items-center gap-1 font-semibold text-warning">
    <FlaskConical size={13} strokeWidth={2} />
    CQ
  </span>
)

export function ReactiveCard({
  row,
  referenceDate,
}: {
  row: SuiviDisplayRow
  referenceDate: string
}) {
  const cause = row.cause
  return (
    <>
      <CardHead
        {...row}
        badge={
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              BADGE_TONE[row.statusKey]
            )}
          >
            {row.statusLabel}
          </span>
        }
      />
      <Facts
        qty={row.qteRestante}
        dateExp={row.dateExp}
        dateExpIso={row.dateExpIso}
        refDate={referenceDate}
        extra={row.cq ? <CqTag /> : null}
      />
      {cause && (
        <Why>
          <div className="font-medium text-foreground">{cause.label}</div>
          {cause.comps.length > 0 && (
            <div className="mt-0.5 font-mono text-xs">
              {cause.comps
                .slice(0, 3)
                .map((c) => `${c.art} −${c.qty}`)
                .join(' · ')}
              {cause.comps.length > 3 && ` +${cause.comps.length - 3}`}
            </div>
          )}
          {cause.reception && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              arrive le {cause.reception.eta}
            </div>
          )}
        </Why>
      )}
    </>
  )
}

export function ProactiveCard({
  row,
  referenceDate,
  showSubAssemblies,
}: {
  row: ProactiveDisplayRow
  referenceDate: string
  showSubAssemblies: boolean
}) {
  const feas = feasibilityTone(row)
  const delay = delayTone(row)
  const comps = row.composants.filter((c) => showSubAssemblies || c.descente === null)
  const firstEta = comps.find((c) => c.reception)?.reception
  return (
    <>
      <CardHead
        {...row}
        badge={
          <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', feas.tone)}>
            <span className={cn('size-2 rounded-full', feas.dot)} />
            {feas.label}
          </span>
        }
      />
      <Facts
        qty={row.qteRestante}
        dateExp={row.dateExp}
        dateExpIso={row.dateExpIso}
        refDate={referenceDate}
        extra={
          <>
            {delay && <span className={cn('font-semibold', delay.tone)}>{delay.label}</span>}
            {row.cq && <CqTag />}
          </>
        }
      />
      {comps.length > 0 && (
        <Why>
          <div className="font-medium text-foreground">
            {comps.length} composant{comps.length > 1 ? 's' : ''} en rupture
          </div>
          <div className="mt-0.5 font-mono text-xs">
            {comps
              .slice(0, 3)
              .map((c) => c.art)
              .join(' · ')}
            {comps.length > 3 && ` +${comps.length - 3}`}
          </div>
          {firstEta && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              1re arrivée le {firstEta.eta}
            </div>
          )}
        </Why>
      )}
    </>
  )
}
