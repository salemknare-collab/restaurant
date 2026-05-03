import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidMount() {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    console.error('Global uncaught error:', event.error);
    
    const errStr = String(event.error);
    if (errStr.includes('Failed to load') || errStr.includes('network') || errStr.includes('offline') || errStr.includes('fetch')) {
      event.preventDefault();
      return;
    }

    this.setState({
      hasError: true,
      error: event.error,
      errorInfo: null
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    const reasonStr = String(event.reason);
    if (reasonStr.includes('network-request-failed') || reasonStr.includes('offline') || reasonStr.includes('unavailable') || reasonStr.includes('Failed to fetch')) {
      event.preventDefault();
      return;
    }

    this.setState({
      hasError: true,
      error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      errorInfo: null
    });
  };

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4 text-foreground" dir="rtl">
          <div className="bg-surface-hover rounded-xl p-8 max-w-2xl w-full shadow-2xl border border-red-500/20">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">عذراً، حدث خطأ غير متوقع</h1>
                <p className="text-muted mt-1">نعتذر عن هذا الخلل. يرجى تحديث الصفحة أو المحاولة مرة أخرى لاحقاً.</p>
              </div>
            </div>
            
            <div className="bg-[#0f172a] rounded-lg p-4 mb-6 overflow-auto max-h-64 border border-slate-800">
              <p className="text-red-400 font-mono text-sm mb-2">{this.state.error && this.state.error.toString()}</p>
              <pre className="text-muted-foreground font-mono text-xs whitespace-pre-wrap text-left" dir="ltr">
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => window.location.reload()}
                className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                تحديث الصفحة
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="bg-slate-700 hover:bg-slate-600 text-foreground px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                العودة للرئيسية
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
