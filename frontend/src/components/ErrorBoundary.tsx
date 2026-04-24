import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || String(error) }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  reset = () => {
    try {
      localStorage.clear()
    } catch {
      // ignore
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-primary, #eaeaea)',
          background: 'var(--bg-primary, #1e1e1e)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <h2 style={{ margin: 0 }}>Something went wrong</h2>
        <p style={{ margin: 0, maxWidth: 520, opacity: 0.8, fontSize: 14 }}>
          {this.state.message}
        </p>
        <p style={{ margin: 0, maxWidth: 520, opacity: 0.6, fontSize: 13 }}>
          This usually happens after a long session. Resetting will clear local
          state and log you out.
        </p>
        <button
          onClick={this.reset}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            border: 'none',
            background: '#4a8fe7',
            color: 'white',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Reset & Reload
        </button>
      </div>
    )
  }
}
