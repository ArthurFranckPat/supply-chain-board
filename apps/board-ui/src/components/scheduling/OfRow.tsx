import { memo } from 'react'
import { Pill } from '@/components/ui/pill'
import { SimpleTooltip } from '@/components/ui/tooltip'
import type { CandidateOF } from '@/types/scheduler'
import { STATUT_CONFIG } from '@/lib/constants'
import { formatDateShort } from '@/lib/format'

interface OfRowProps {
  of: CandidateOF
  density: 'compact' | 'comfort'
  index: number
}

export const OfRow = memo(function OfRow({ of, density }: OfRowProps) {
  const s = STATUT_CONFIG[of.statut_num] ?? STATUT_CONFIG[3]
  const sched = new Date(of.scheduled_day ?? '')
  const due = new Date(of.due_date)
  const diffDays = Math.round((due.getTime() - sched.getTime()) / 86400000)
  const blocked = !!of.blocking_components
  const padY = density === 'compact' ? '3px 12px' : '5px 12px'

  return (
    <div
      className="grid gap-2 items-center text-[11px] border-b border-border/30"
      style={{
        gridTemplateColumns: '130px 120px 1fr 90px 70px 60px 60px 85px 85px',
        padding: padY,
        borderLeft: blocked ? '2px solid var(--color-destructive)' : '2px solid transparent',
      }}
    >
      <span className="font-mono text-[11px]">{of.num_of}</span>
      {of.linked_orders ? (
        <SimpleTooltip
          side="bottom"
          content={
            <div className="max-w-[260px]">
              {of.linked_orders.split(',').map((cmd: string, ci: number) => (
                <div key={ci} className="font-mono text-[11px] py-0.5">{cmd.trim()}</div>
              ))}
            </div>
          }
        >
          <span className="font-mono text-[11px] text-primary cursor-pointer truncate">
            {of.linked_orders.split(',').length > 1
              ? `${of.linked_orders.split(',')[0].trim()} (+${of.linked_orders.split(',').length - 1})`
              : of.linked_orders.split(',')[0].trim()}
          </span>
        </SimpleTooltip>
      ) : (
        <span className="text-[10px] text-muted-foreground">-</span>
      )}
      <div className="flex flex-col gap-0 min-w-0">
        <span className="font-semibold text-[11px]">{of.article}</span>
        {of.description && (
          <span className="text-[10px] text-muted-foreground truncate">{of.description}</span>
        )}
      </div>
      <Pill tone={s.tone}>{s.label}</Pill>
      <span className="font-mono text-[11px] text-muted-foreground">{of.line}</span>
      <span className="text-right tabular-nums font-mono text-[11px]">{of.quantity.toLocaleString('fr-FR')}</span>
      <span className="text-right tabular-nums font-mono text-[11px] text-muted-foreground">{of.charge_hours.toFixed(1)}h</span>
      <span className={`font-mono text-[11px] ${diffDays < 0 ? 'text-destructive font-semibold' : diffDays < 2 ? 'text-orange' : 'text-muted-foreground'}`}>
        {formatDateShort(of.due_date)}{diffDays < 0 ? ' +' : ''}
      </span>
      {blocked ? (
        <SimpleTooltip
          side="left"
          content={
            <div className="max-w-[280px]">
              <div className="font-semibold text-destructive mb-1">Composants bloquants</div>
              {of.blocking_components.split(',').map((comp: string, ci: number) => (
                <div key={ci} className="text-[11px] py-0.5">{comp.trim()}</div>
              ))}
            </div>
          }
        >
          <span className="text-destructive font-semibold text-[11px] cursor-pointer">Bloqué</span>
        </SimpleTooltip>
      ) : (
        <span className="text-green text-[11px]">OK</span>
      )}
    </div>
  )
})
