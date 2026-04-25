interface LoadingInlineProps { label: string; sublabel?: string }

export function LoadingInline({ label, sublabel }: LoadingInlineProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin" />
      <div className="text-center">
        <p className="text-xs font-medium text-muted-foreground">Chargement {label}...</p>
        {sublabel && <p className="text-[10px] text-muted-foreground/70 mt-1">{sublabel}</p>}
      </div>
    </div>
  )
}

interface LoadingErrorProps { message: string; onRetry?: () => void }

export function LoadingError({ message, onRetry }: LoadingErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <div className="h-6 w-6 bg-destructive/10 flex items-center justify-center"><span className="text-destructive text-xs font-bold">!</span></div>
      <p className="text-xs text-destructive text-center max-w-sm">{message}</p>
      {onRetry && <button onClick={onRetry} className="text-[11px] text-primary hover:text-primary/80 underline">Réessayer</button>}
    </div>
  )
}

interface LoadingEmptyProps { message: string; icon?: React.ReactNode; action?: { label: string; onClick: () => void } }

export function LoadingEmpty({ message, icon, action }: LoadingEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      {icon ? icon : <div className="h-6 w-6 bg-muted flex items-center justify-center"><span className="text-muted-foreground text-xs">~</span></div>}
      <p className="text-xs text-muted-foreground text-center max-w-sm">{message}</p>
      {action && <button onClick={action.onClick} className="text-[11px] text-primary hover:text-primary/80 underline">{action.label}</button>}
    </div>
  )
}
