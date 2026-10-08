import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("Verdio page crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="v2-boundary">
          <AlertTriangle className="v2-boundary-icon" size={24} aria-hidden="true" />
          <div className="v2-boundary-copy">
            <p className="v2-boundary-title">This section couldn't be displayed.</p>
            <p className="v2-boundary-detail">{this.state.error.message || "An unexpected error occurred while rendering this page."}</p>
            <button type="button" onClick={() => this.setState({ error: null })} className="v2-btn is-small">Try again</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
