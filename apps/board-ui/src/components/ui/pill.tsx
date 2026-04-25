import type { ReactNode } from 'react'

type PillTone = 'default' | 'primary' | 'danger' | 'warn' | 'good' | 'outline'

interface PillProps {
  children: ReactNode
  tone?: PillTone
  icon?: ReactNode
  mono?: boolean
}

const TONE_CLASSES: Record<PillTone, string> = {
  default: 'bg-muted text-muted-foreground border-border',
  primary: 'bg-primary/10 text-primary border-primary/20',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
  warn: 'bg-orange/10 text-orange border-orange/20',
  good: 'bg-green/10 text-green border-green/20',
  outline: 'bg-transparent text-foreground border border-border',
}

export function Pill({ children, tone = 'default', icon, mono }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold border whitespace-nowrap leading-snug ${
        TONE_CLASSES[tone]
      } ${mono ? 'font-mono' : ''}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
