import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary'
import type { ReactNode } from 'react'

function Fallback({ error, resetErrorBoundary }: { error: unknown; resetErrorBoundary: () => void }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="p-6 text-center bg-card border border-border rounded-xl m-4">
      <div className="flex items-center justify-center mb-3">
        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg className="h-5 w-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
      </div>
      <p className="text-destructive font-semibold">Une erreur est survenue</p>
      <p className="text-sm text-muted-foreground mt-1">{message}</p>
      <button
        onClick={resetErrorBoundary}
        className="mt-4 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
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
        // Reset any state that might have caused the error
        window.location.reload()
      }}
    >
      {children}
    </ReactErrorBoundary>
  )
}
