"use client";

import { OpsIcon } from "@/components/shared/ops-icon";
import { cardClass, inputClass, labelClass } from "../shared";

export function AchievementBuilderSection({
  builder,
  onFieldChange,
  onSubmit,
}: {
  builder: { action: string; outcome: string; metric: string };
  onFieldChange: (field: "action" | "outcome" | "metric", value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <section className={`${cardClass} space-y-3`}>
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#a5b4fc]">
        <OpsIcon name="sparkles" size={14} />
        <span>Structured Achievement Builder</span>
      </h2>
      <div className="grid gap-3 @lg:grid-cols-3">
        <div>
          <label className={labelClass}>Action Verb</label>
          <input
            value={builder.action}
            onChange={(e) => onFieldChange("action", e.target.value)}
            placeholder="e.g. Spearheaded GTM strategy"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Quantified Metric</label>
          <input
            value={builder.metric}
            onChange={(e) => onFieldChange("metric", e.target.value)}
            placeholder="e.g. delivering 34% CAC reduction"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Outcome / Impact</label>
          <input
            value={builder.outcome}
            onChange={(e) => onFieldChange("outcome", e.target.value)}
            placeholder="e.g. across 4 regional markets"
            className={inputClass}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#4338ca] via-[#4f46e5] to-[#6366f1] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.15)]"
      >
        <OpsIcon name="plus" size={13} />
        Append Structured Bullet to Experience
      </button>
    </section>
  );
}
