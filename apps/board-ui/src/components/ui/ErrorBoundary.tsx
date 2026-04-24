import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="p-6 text-center">
          <p className="text-destructive font-semibold">Une erreur est survenue</p>
          <p className="text-sm text-muted-foreground mt-1">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-3 px-3 py-1.5 text-sm bg-accent rounded-md hover:bg-accent/80"
          >
            Reessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
