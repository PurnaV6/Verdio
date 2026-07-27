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
        <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertTriangle className="text-amber-600" size={28} />
          <p className="text-sm font-semibold text-slate-900">This section couldn't be displayed.</p>
          <p className="text-xs text-slate-500 max-w-sm">{this.state.error.message || "An unexpected error occurred while rendering this page."}</p>
          <button onClick={() => this.setState({ error: null })} className="secondary-button">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
