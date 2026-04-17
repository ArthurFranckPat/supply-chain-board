import type { ReactNode } from 'react'

type PillTone = 'default' | 'primary' | 'danger' | 'warn' | 'good' | 'outline'

interface PillProps {
  children: ReactNode
  tone?: PillTone
  icon?: ReactNode
  mono?: boolean
}

const TONE_CLASSES: Record<PillTone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  danger: 'bg-destructive/10 text-destructive',
  warn: 'bg-orange/10 text-orange',
  good: 'bg-green/10 text-green',
  outline: 'bg-transparent text-foreground border border-border',
}

export function Pill({ children, tone = 'default', icon, mono }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border border-transparent whitespace-nowrap leading-snug ${
        TONE_CLASSES[tone]
      } ${mono ? 'font-mono' : ''}`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  )
}
