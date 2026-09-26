import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-2xl p-6 shadow-lg">
            <h2 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              The app encountered an unexpected error. Please refresh the page to continue.
            </p>
            <pre className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-auto max-h-32 mb-4">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
