import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Reel Builder crashed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            background: "#05070C",
            color: "#F8FAFC",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <p style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#20D4F0", marginBottom: 12 }}>
              Reel Builder
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Something went wrong</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(248,250,252,0.72)", marginBottom: 20 }}>
              The app hit an error while loading. Try a hard refresh (Cmd+Shift+R). If it keeps happening, clear site
              data for this origin and reload.
            </p>
            <pre
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                padding: 14,
                borderRadius: 10,
                background: "rgba(255,255,255,0.06)",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                padding: "10px 18px",
                borderRadius: 999,
                border: "none",
                background: "#FFFFFF",
                color: "#05070C",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
