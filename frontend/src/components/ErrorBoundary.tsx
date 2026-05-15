import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Last-resort error boundary so a render-time crash doesn't leave the
 * dashboard with a blank white screen. Real telemetry (Sentry et al.)
 * should hook into componentDidCatch later.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    // TODO: forward to Sentry / Datadog RUM once configured.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', err, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Recarregue a página. Se o problema continuar, contate o administrador.
        </p>
        {this.state.message ? (
          <pre className="mt-4 max-h-40 overflow-auto rounded bg-slate-100 p-3 text-left text-xs text-slate-700">
            {this.state.message}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={this.handleReset}
          className="mt-4 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Tentar novamente
        </button>
      </div>
    );
  }
}
