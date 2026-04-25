import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'
import type { ReactNode } from 'react'

function Fallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="p-4 text-center bg-card border border-border m-3">
      <div className="flex items-center justify-center mb-2">
        <div className="h-8 w-8 bg-destructive/10 flex items-center justify-center">
          <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      </div>
      <p className="text-destructive font-semibold text-xs">Une erreur est survenue</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
      <button
        onClick={resetErrorBoundary}
        className="mt-3 px-3 py-1.5 text-[11px] bg-primary text-white hover:bg-primary/90 transition-colors"
      >
        Réessayer
      </button>
    </div>
  )
}

function logError(error: unknown, info: { componentStack?: string | null }) {
  console.error('ErrorBoundary caught an error:', error)
  console.error('Component stack:', info.componentStack)
}

interface Props {
  children: ReactNode
}

export function ErrorBoundary({ children }: Props) {
  return (
    <ReactErrorBoundary
      FallbackComponent={Fallback}
      onError={logError}
      onReset={() => {
        window.location.reload()
      }}
    >
      {children}
    </ReactErrorBoundary>
  )
}
