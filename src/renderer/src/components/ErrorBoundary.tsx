import { Component, type ErrorInfo, type ReactNode } from 'react'

type State = { error: Error | null; info: ErrorInfo | null }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info })
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = (): void => this.setState({ error: null, info: null })

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="h-screen flex items-center justify-center p-8 bg-neutral-100 dark:bg-neutral-900">
          <div className="max-w-2xl w-full rounded-lg ring-1 ring-red-300 dark:ring-red-700 bg-white dark:bg-neutral-800 p-6 shadow-lg">
            <h1 className="text-base font-semibold text-red-700 dark:text-red-400 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-neutral-700 dark:text-neutral-200 font-mono whitespace-pre-wrap break-words">
              {this.state.error.message}
            </p>
            {this.state.info && (
              <details className="mt-3 text-xs text-neutral-500 font-mono">
                <summary className="cursor-pointer select-none">Component stack</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.info.componentStack}</pre>
              </details>
            )}
            {this.state.error.stack && (
              <details className="mt-3 text-xs text-neutral-500 font-mono">
                <summary className="cursor-pointer select-none">Stack trace</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.error.stack}</pre>
              </details>
            )}
            <button
              onClick={this.reset}
              className="mt-4 h-8 px-3 rounded-md bg-blue-500 text-white text-sm font-medium hover:bg-blue-600"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
