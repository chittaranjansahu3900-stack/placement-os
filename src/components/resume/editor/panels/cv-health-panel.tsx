"use client";

import { useMemo } from "react";
import { computeCvHealth } from "@/lib/resume";
import type { CvContent } from "@/types/domain";

const STATUS_STYLE: Record<string, string> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
};

export function CvHealthPanel({ content }: { content: CvContent }) {
  const report = useMemo(() => computeCvHealth(content), [content]);
  const scoreColor = report.score >= 80 ? "#4ade80" : report.score >= 55 ? "#fbbf24" : "#f87171";

  return (
    <div className="scan-body" style={{ padding: 0 }}>
      <div className="scan-glance flex items-center gap-3">
        <div
          className="scan-score"
          style={{ background: `${scoreColor}22`, color: scoreColor, border: `2px solid ${scoreColor}` }}
        >
          {report.score}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">CV Health Score</p>
          <p className="text-xs text-slate-500">Deterministic completeness &amp; quality checks</p>
        </div>
      </div>

      <div className="scan-sections mt-3">
        {report.checks.map((check) => (
          <div key={check.id} className={`scan-sec-row ${STATUS_STYLE[check.status]}`}>
            <span className="scan-sec-name">{check.label}</span>
            <span className="scan-sec-note">{check.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
