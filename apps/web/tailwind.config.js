/** @type {import('tailwindcss').Config} */
export default {
  // Only scan files that actually use Tailwind classes.
  // This keeps the production CSS bundle minimal.
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // M25 fix: brand was green #22c55e which conflicted with CSS --brand: #0f172a (slate).
      // Using slate palette so Tailwind bg-brand-* classes match the design system tokens.
      colors: {
        brand: {
          50:  "#f8fafc",
          100: "#f1f5f9",
          500: "#475569",
          600: "#334155",
          700: "#1e293b",
          900: "#0f172a",
        },
        danger: {
          50:  "#fef2f2",
          500: "#ef4444",
          700: "#b91c1c",
        },
        warning: {
          50:  "#fffbeb",
          500: "#f59e0b",
          700: "#b45309",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};
