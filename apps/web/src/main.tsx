import React from "react";
import ReactDOM from "react-dom/client";

/**
 * React entry point — bare skeleton for Phase 0.
 * The full Merchant Command Center UI is built in Phase 4.
 */
function App(): React.JSX.Element {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>RevRec — Autonomous AI Revenue Recovery Engine</h1>
      <p>🚧 Phase 0: Monorepo scaffold complete. UI builds in Phase 4.</p>
      <p>Backend API: <a href="http://localhost:3001/health">http://localhost:3001/health</a></p>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("[RevRec Web] Root element #root not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
