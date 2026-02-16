import type { ReactNode } from "react";

const STEP_STYLES = {
  disabled: "border-gray-800 opacity-50",
  active: "border-indigo-500 bg-indigo-500/5",
  complete: "border-green-600/50 bg-green-600/5",
} as const;

type StepStatus = keyof typeof STEP_STYLES;

export function StepCard({
  step,
  title,
  status,
  children,
}: {
  step: number;
  title: string;
  status: StepStatus;
  children: ReactNode;
}) {
  return (
    <div className={`border rounded-xl p-5 transition-all ${STEP_STYLES[status]}`}>
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
            status === "complete"
              ? "bg-green-600 text-white"
              : status === "active"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-500"
          }`}
        >
          {status === "complete" ? "\u2713" : step}
        </span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      {status !== "disabled" && <div>{children}</div>}
    </div>
  );
}
