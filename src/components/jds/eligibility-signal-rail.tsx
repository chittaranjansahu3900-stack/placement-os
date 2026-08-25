import { OpsIcon } from "@/components/shared/ops-icon";

export type EligibilitySignalState = "pass" | "fail" | "review" | "unknown";

export type EligibilitySignalItem = {
  label: string;
  state: EligibilitySignalState;
  detail: string;
};

const stateStyles: Record<EligibilitySignalState, string> = {
  pass: "border-emerald-700/80 bg-emerald-950/80 text-emerald-300",
  fail: "border-red-700/80 bg-red-950/80 text-red-300",
  review: "border-amber-700/80 bg-amber-950/80 text-amber-300",
  unknown: "border-slate-700 bg-slate-900 text-slate-400",
};

function StateMark({ state }: { state: EligibilitySignalState }) {
  if (state === "pass") return <OpsIcon name="check" size={11} className="text-emerald-400" />;
  if (state === "fail") return <OpsIcon name="x" size={11} className="text-red-400" />;
  if (state === "review") return <OpsIcon name="alert-triangle" size={11} className="text-amber-400" />;
  return <span aria-hidden className="text-slate-500">—</span>;
}

export function EligibilitySignalRail({
  items,
  compact = false,
}: {
  items: EligibilitySignalItem[];
  compact?: boolean;
}) {
  const passed = items.filter((item) => item.state === "pass").length;
  const failed = items.filter((item) => item.state === "fail").length;
  const result = failed > 0 ? "Review required" : `${passed}/${items.length} criteria met`;

  return (
    <div className="min-w-0" aria-label={`Eligibility: ${result}`}>
      <div className="flex min-w-max items-stretch gap-1 rounded-md overflow-hidden" role="list">
        {items.map((item) => (
          <span
            key={item.label}
            role="listitem"
            title={`${item.label}: ${item.detail}`}
            className={`inline-flex items-center gap-1 rounded border font-mono font-semibold transition-colors ${stateStyles[item.state]} ${
              compact ? "min-h-6 px-1.5 text-[9px]" : "min-h-7 px-2 text-[10px]"
            }`}
          >
            <StateMark state={item.state} />
            <span>{item.label}</span>
            <span className="sr-only">: {item.detail}</span>
          </span>
        ))}
        <span
          className={`inline-flex items-center rounded border border-slate-750 bg-slate-900/90 px-2 font-mono text-slate-300 ${
            compact ? "min-h-6 text-[9px]" : "min-h-7 text-[10px]"
          }`}
        >
          {result}
        </span>
      </div>
    </div>
  );
}
