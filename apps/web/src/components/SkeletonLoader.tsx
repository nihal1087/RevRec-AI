/**
 * SkeletonLoader.tsx — Animated shimmer placeholder components
 * Prevents the "flash of empty content" on initial dashboard load.
 */

const shimmer = {
  background: "linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-hover) 50%, var(--bg-surface) 75%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.5s infinite",
  borderRadius: 8,
} as const;

export function MetricCardSkeleton(): JSX.Element {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "20px 24px",
      minHeight: 110,
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      <div style={{ ...shimmer, height: 12, width: "45%" }} />
      <div style={{ ...shimmer, height: 28, width: "70%" }} />
      <div style={{ ...shimmer, height: 10, width: "55%" }} />
    </div>
  );
}

export function TableRowSkeleton(): JSX.Element {
  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      {["30%", "20%", "15%", "15%", "12%", "8%"].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{ ...shimmer, height: 13, width: w }} />
        </td>
      ))}
    </tr>
  );
}

export function WorkflowTableSkeleton(): JSX.Element {
  return (
    <tbody>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRowSkeleton key={i} />
      ))}
    </tbody>
  );
}
