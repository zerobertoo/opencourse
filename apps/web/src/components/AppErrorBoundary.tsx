import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/StateViews';

interface State {
  failed: boolean;
}

/** Last resort for a render error: shows the error state instead of a blank page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.failed) return <ErrorState onRetry={() => window.location.reload()} />;
    return this.props.children;
  }
}
