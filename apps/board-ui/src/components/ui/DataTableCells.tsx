import { cn } from '@/lib/utils'

export function NumberCell({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  return (
    <span className={cn('font-mono text-[13px] tabular-nums', className)}>
      {value.toLocaleString('fr-FR', { maximumFractionDigits: decimals })}
    </span>
  )
}

export function EuroCell({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  return (
    <span className={cn('font-mono text-[13px] tabular-nums', className)}>
      {value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: decimals })}
    </span>
  )
}

export function BadgeCell({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode
  tone?: 'default' | 'success' | 'danger' | 'warning' | 'info'
  className?: string
}) {
  const toneMap = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-green/10 text-green',
    danger: 'bg-destructive/10 text-destructive',
    warning: 'bg-amber-500/10 text-amber-600',
    info: 'bg-primary/10 text-primary',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', toneMap[tone], className)}>
      {children}
    </span>
  )
}

export function MonoCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[12.5px]', className)}>{children}</span>
}

export function TextCell({ children, muted = false, truncate = false, className }: { children: React.ReactNode; muted?: boolean; truncate?: boolean; className?: string }) {
  return (
    <span className={cn('text-[13px]', muted && 'text-muted-foreground', truncate && 'block max-w-[220px] truncate', className)}>
      {children}
    </span>
  )
}

export function DateCell({ date, className }: { date: string | null; className?: string }) {
  if (!date) return <span className={cn('text-muted-foreground text-[12px]', className)}>—</span>
  const d = new Date(date)
  return (
    <span className={cn('text-[12.5px] text-muted-foreground', className)}>
      {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
    </span>
  )
}
