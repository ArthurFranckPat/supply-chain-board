import { memo } from 'react'
import { AlertOctagon, CheckCircle2 } from 'lucide-react'
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

export const OfRow = memo(function OfRow({ of, density, index }: OfRowProps) {
  const s = STATUT_CONFIG[of.statut_num] ?? STATUT_CONFIG[3]
  const sched = new Date(of.scheduled_day ?? '')
  const due = new Date(of.due_date)
  const diffDays = Math.round((due.getTime() - sched.getTime()) / 86400000)
  const dueTone = diffDays < 0 ? 'danger' : diffDays < 2 ? 'warn' : 'default'
  const blocked = !!of.blocking_components
  const rowH = density === 'compact' ? '30px' : '38px'

  return (
    <div
      className="grid gap-3 items-center text-xs border-b border-border/50"
      style={{
        gridTemplateColumns: '130px 120px 1fr 90px 70px 60px 60px 85px 85px',
        padding: density === 'compact' ? '4px 14px' : '7px 14px',
        minHeight: rowH,
        background: index % 2 === 1 ? 'var(--color-accent)' : 'transparent',
        borderLeft: blocked ? '3px solid var(--color-destructive)' : '3px solid transparent',
      }}
    >
      <span className="font-mono text-[11.5px] font-medium">{of.num_of}</span>
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
        <span className="text-[10px] text-muted-foreground/50">-</span>
      )}
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-xs">{of.article}</span>
        {of.description && (
          <span className="text-[10.5px] text-muted-foreground truncate">{of.description}</span>
        )}
      </div>
      <Pill tone={s.tone}>{s.label}</Pill>
      <span className="font-mono text-[11px] text-muted-foreground">{of.line}</span>
      <span className="text-right tabular-nums">{of.quantity.toLocaleString('fr-FR')}</span>
      <span className="text-right tabular-nums font-mono">{of.charge_hours.toFixed(1)}h</span>
      <span className={`font-mono text-[11px] ${dueTone === 'danger' ? 'text-destructive font-semibold' : dueTone === 'warn' ? 'text-orange font-semibold' : 'text-muted-foreground'}`}>
        {formatDateShort(of.due_date)}{diffDays < 0 ? ' ↗' : ''}
      </span>
      {blocked ? (
        <SimpleTooltip
          side="left"
          content={
            <div className="max-w-[280px]">
              <div className="font-semibold text-destructive mb-1">Composants bloquants</div>
              {of.blocking_components.split(',').map((comp: string, ci: number) => (
                <div key={ci} className="flex items-center gap-1.5 text-[11px] py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  {comp.trim()}
                </div>
              ))}
            </div>
          }
        >
          <span className="inline-flex items-center gap-1 text-destructive font-semibold text-[11px] cursor-pointer">
            <AlertOctagon className="h-3 w-3" />
            Bloqué
          </span>
        </SimpleTooltip>
      ) : (
        <SimpleTooltip
          side="left"
          content={<span>Tous les composants sont disponibles</span>}
        >
          <span className="inline-flex items-center gap-1 text-green text-[11px] cursor-pointer">
            <CheckCircle2 className="h-3 w-3" />
            OK
          </span>
        </SimpleTooltip>
      )}
    </div>
  )
})
