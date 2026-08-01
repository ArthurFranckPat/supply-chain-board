import * as React from 'react'
import { ThinkingOrb } from 'thinking-orbs'

import { Spinner, type SpinnerProps } from './spinner'
import { cn } from '@r/lib/utils'

export type LoadingOrbState =
  'working' | 'searching' | 'solving' | 'listening' | 'composing' | 'shaping'

export interface LoadingStateProps extends React.ComponentPropsWithoutRef<'div'> {
  title?: string
  description?: string
  /** `orb` = thinking-orbs (attente centrée). `spinner` = Lucide (défaut). */
  variant?: 'spinner' | 'orb'
  orbState?: LoadingOrbState
  spinnerSize?: SpinnerProps['size']
  spinnerVariant?: SpinnerProps['variant']
  compact?: boolean
  icon?: React.ReactNode
}

export function LoadingState({
  title = 'Chargement des données...',
  description,
  variant = 'spinner',
  orbState = 'working',
  spinnerSize = 'lg',
  spinnerVariant = 'brand',
  compact = false,
  icon,
  className,
  ...props
}: LoadingStateProps) {
  const visual =
    icon ??
    (variant === 'orb' ? (
      <ThinkingOrb state={orbState} size={compact ? 20 : 64} aria-label={title || 'Chargement'} />
    ) : (
      <Spinner size={spinnerSize} variant={spinnerVariant} />
    ))

  return (
    <div
      data-slot="loading-state"
      className={cn(
        'flex flex-col items-center justify-center text-center animate-in fade-in-50 duration-200',
        compact ? 'py-6 gap-2' : 'py-16 gap-3.5 px-4',
        className
      )}
      {...props}
    >
      <div className="relative flex items-center justify-center">{visual}</div>
      {(title || description) && (
        <div className="space-y-1 max-w-xs">
          {title && (
            <p
              className={cn(
                'font-medium tracking-tight text-foreground',
                compact ? 'text-xs' : 'text-sm'
              )}
            >
              {title}
            </p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
      )}
    </div>
  )
}
