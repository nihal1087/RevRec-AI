import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve @revrec/types to local source during development
      "@revrec/types": path.resolve(__dirname, "../../packages/types/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to the backend to avoid CORS in development
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
