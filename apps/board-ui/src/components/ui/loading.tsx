import { Loader2 } from 'lucide-react'

interface LoadingInlineProps {
  label: string
  sublabel?: string
}

export function LoadingInline({ label, sublabel }: LoadingInlineProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      <div className="text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Chargement {label}...
        </p>
        {sublabel && (
          <p className="text-xs text-muted-foreground/70 mt-1">{sublabel}</p>
        )}
      </div>
    </div>
  )
}

interface LoadingErrorProps {
  message: string
  onRetry?: () => void
}

export function LoadingError({ message, onRetry }: LoadingErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center">
        <span className="text-red-500 text-lg">!</span>
      </div>
      <p className="text-sm text-red-700 text-center max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
        >
          Réessayer
        </button>
      )}
    </div>
  )
}

interface LoadingEmptyProps {
  message: string
  icon?: React.ReactNode
  action?: { label: string; onClick: () => void }
}

export function LoadingEmpty({ message, icon, action }: LoadingEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      {icon ? (
        icon
      ) : (
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-lg">~</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground text-center max-w-sm">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs font-medium text-teal-700 hover:text-teal-900 underline underline-offset-2"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
