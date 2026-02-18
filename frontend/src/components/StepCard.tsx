import type { ReactNode } from "react";

type AccentColor = "cyan" | "magenta" | "green" | "orange";

const ACCENT_BORDER: Record<AccentColor, string> = {
  cyan: "neon-border-cyan",
  magenta: "neon-border-magenta",
  green: "neon-border-green",
  orange: "neon-border-orange",
};

const ACCENT_BG: Record<AccentColor, string> = {
  cyan: "bg-neon-cyan text-bg-deep",
  magenta: "bg-neon-magenta text-bg-deep",
  green: "bg-neon-green text-bg-deep",
  orange: "bg-neon-orange text-bg-deep",
};

const ACCENT_TEXT: Record<AccentColor, string> = {
  cyan: "neon-text-cyan",
  magenta: "neon-text-magenta",
  green: "neon-text-green",
  orange: "neon-text-orange",
};

const STEP_STYLES = {
  disabled: "border-border-dim opacity-40",
  active: "neon-border-cyan",
  complete: "neon-border-green",
} as const;

type StepStatus = keyof typeof STEP_STYLES;

export function StepCard({
  step,
  title,
  status,
  children,
  accentColor,
}: {
  step: number;
  title: string;
  status: StepStatus;
  children: ReactNode;
  accentColor?: AccentColor;
}) {
  const accent = accentColor || "cyan";
  const activeStyle = status === "active" ? ACCENT_BORDER[accent] : STEP_STYLES[status];

  return (
    <div className={`glass-panel border p-5 transition-all ${activeStyle}`}>
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`hex-badge shrink-0 ${
            status === "complete"
              ? "bg-neon-green text-bg-deep"
              : status === "active"
                ? ACCENT_BG[accent]
                : "bg-border-dim text-gray-600"
          }`}
        >
          {status === "complete" ? "\u2713" : step}
        </span>
        <h3 className={`font-display font-bold text-sm tracking-wide ${
          status === "active" ? ACCENT_TEXT[accent] : status === "complete" ? "neon-text-green" : "text-gray-500"
        }`}>
          {title}
        </h3>
      </div>
      {status !== "disabled" && <div className="font-body">{children}</div>}
    </div>
  );
}
