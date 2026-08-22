import { OpsIcon } from "@/components/ops-icon";

export type EligibilitySignalState = "pass" | "fail" | "review" | "unknown";

export type EligibilitySignalItem = {
  label: string;
  state: EligibilitySignalState;
  detail: string;
};

const stateStyles: Record<EligibilitySignalState, string> = {
  pass: "border-emerald-700 bg-emerald-950 text-emerald-200",
  fail: "border-red-700 bg-red-950 text-red-200",
  review: "border-amber-700 bg-amber-950 text-amber-200",
  unknown: "border-slate-700 bg-slate-900 text-slate-400",
};

function StateMark({ state }: { state: EligibilitySignalState }) {
  if (state === "pass") return <OpsIcon name="check" size={12} />;
  if (state === "fail") return <OpsIcon name="x" size={12} />;
  if (state === "review") return <OpsIcon name="alert-triangle" size={12} />;
  return <span aria-hidden>—</span>;
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
  const result = failed > 0 ? "Review required" : `${passed}/${items.length} criteria clear`;

  return (
    <div className="min-w-0" aria-label={`Eligibility: ${result}`}>
      <div className="flex min-w-max items-stretch gap-1" role="list">
        {items.map((item) => (
          <span
            key={item.label}
            role="listitem"
            title={`${item.label}: ${item.detail}`}
            className={`inline-flex items-center gap-1 border-l-2 font-mono font-semibold ${stateStyles[item.state]} ${
              compact ? "min-h-6 px-1.5 text-[9px]" : "min-h-8 px-2 text-[10px]"
            }`}
          >
            <StateMark state={item.state} />
            <span>{item.label}</span>
            <span className="sr-only">: {item.detail}</span>
          </span>
        ))}
        <span
          className={`inline-flex items-center border border-slate-700 bg-[#0d1928] px-2 font-mono text-slate-300 ${
            compact ? "min-h-6 text-[9px]" : "min-h-8 text-[10px]"
          }`}
        >
          {result}
        </span>
      </div>
    </div>
  );
}
