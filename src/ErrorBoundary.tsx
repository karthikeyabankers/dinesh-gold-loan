import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

// Without this, any uncaught error while rendering (e.g. a value that
// isn't valid as a React child) crashes the ENTIRE app to a blank white
// screen with no way to recover except a hard refresh. This catches
// that instead and shows a readable message with a reload button.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Something went wrong.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: '#666', maxWidth: '28rem' }}>{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '0.5rem',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reload the app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
