import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

// L5 fix: top-level Error Boundary prevents a single crashing chart from
// blanking the entire screen. Renders a dismissible "something went wrong" card.
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 48, textAlign: "center", fontFamily: "Inter, sans-serif",
          color: "#374151", maxWidth: 520, margin: "80px auto",
        }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#6b7280", marginBottom: 24, fontSize: 14 }}>
            {this.state.error?.message ?? "An unexpected error occurred in the RevRec dashboard."}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              backgroundColor: "#2563eb", color: "#fff", fontWeight: 600,
              fontSize: 14, cursor: "pointer",
            }}
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("[RevRec Web] Root element #root not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
