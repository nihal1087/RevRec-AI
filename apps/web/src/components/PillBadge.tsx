import React from "react";

export type PillVariant = "green" | "blue" | "amber" | "purple" | "teal" | "red" | "neutral";

export interface PillBadgeProps {
  children: React.ReactNode;
  variant?: PillVariant;
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const VARIANT_STYLES: Record<PillVariant, { bg: string; text: string; dot: string }> = {
  green: {
    bg: "#e6f4ea",
    text: "#0b8043",
    dot: "#0b8043",
  },
  blue: {
    bg: "#e8f0fe",
    text: "#1a73e8",
    dot: "#1a73e8",
  },
  amber: {
    bg: "#fef7e0",
    text: "#b06000",
    dot: "#b06000",
  },
  purple: {
    bg: "#f3e8fd",
    text: "#8430ce",
    dot: "#8430ce",
  },
  teal: {
    bg: "#e6fffa",
    text: "#0f766e",
    dot: "#0f766e",
  },
  red: {
    bg: "#fce8e6",
    text: "#c5221f",
    dot: "#c5221f",
  },
  neutral: {
    bg: "#f1f3f4",
    text: "#5f6368",
    dot: "#5f6368",
  },
};

export function PillBadge({
  children,
  variant = "green",
  size = "sm",
  dot = false,
  className = "",
  style = {},
}: PillBadgeProps): React.JSX.Element {
  const vStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.green;
  const isSmall = size === "sm";

  return (
    <span
      className={`ds-pill-badge ds-pill-badge-${variant} ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: isSmall ? "2px 8px" : "3px 10px",
        borderRadius: 9999,
        backgroundColor: vStyle.bg,
        color: vStyle.text,
        fontSize: isSmall ? 10.5 : 11.5,
        fontWeight: 700,
        lineHeight: 1.35,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        userSelect: "none",
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            backgroundColor: vStyle.dot,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

export interface RiskBadgeProps {
  tier?: "LOW" | "MEDIUM" | "HIGH" | string | null;
  score?: number | null;
  showScore?: boolean;
  scoreLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function RiskBadge({
  tier = "LOW",
  score,
  showScore = false,
  scoreLabel = "",
  className = "",
  style = {},
}: RiskBadgeProps): React.JSX.Element {
  const normalizedTier = (tier ?? "LOW").toUpperCase();
  const variant: PillVariant =
    normalizedTier === "HIGH" ? "red" : normalizedTier === "MEDIUM" ? "amber" : "green";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        ...style,
      }}
      className={className}
    >
      <PillBadge variant={variant}>
        {normalizedTier} RISK
      </PillBadge>
      {showScore && score !== undefined && score !== null && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-faint)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}
          {scoreLabel ? ` ${scoreLabel}` : ""}
        </span>
      )}
    </div>
  );
}

export default PillBadge;
