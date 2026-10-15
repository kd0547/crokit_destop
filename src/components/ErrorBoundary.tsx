import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// The original WPF app had no global exception handler at all, so any
// unhandled error crashed the whole process. This boundary keeps a render
// error from taking down the entire window.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("Unhandled render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 32,
            background: "var(--color-bg)",
            color: "var(--color-text)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>문제가 발생했습니다</div>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              color: "var(--color-neutral-400)",
              fontSize: 12,
              maxWidth: 420,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-2)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
            }}
          >
            {String(this.state.error.message)}
          </pre>
          <button className="btn btn-primary" onClick={() => this.setState({ error: null })} style={{ marginTop: 4 }}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
