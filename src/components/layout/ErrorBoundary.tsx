import { Component, ErrorInfo, ReactNode } from "react";
import { FlowButton } from "@/components/ui/flow-button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: "#10141a" }}>
          <div className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center" style={{ background: "rgba(255,180,171,0.1)", color: "#ffb4ab" }}>
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#dfe2eb" }}>Something went wrong</h1>
          <p className="max-w-md text-sm mb-8" style={{ color: "#849490" }}>
            An unexpected error occurred. The application was unable to recover.
          </p>
          <div className="p-4 rounded-lg bg-black/40 text-left max-w-2xl w-full mb-8 overflow-auto border border-red-500/20">
            <code className="text-xs text-red-400 font-mono">
              {this.state.error?.message}
            </code>
          </div>
          <FlowButton
            onClick={() => window.location.href = '/'}
            text="Return Home"
          />
        </div>
      );
    }

    return this.props.children;
  }
}
