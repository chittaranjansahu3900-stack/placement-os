"use client";

import { useMemo, useState } from "react";
import { normalizeCvContent, listCvBullets } from "@/lib/resume";
import { diffLines } from "@/lib/resume-diff";
import type { CvVersionRow } from "../shared";

export function VersionDiffPanel({ versions, currentDocumentId }: { versions: CvVersionRow[]; currentDocumentId: string }) {
  const sorted = useMemo(() => [...versions].sort((a, b) => b.version_no - a.version_no), [versions]);
  const [fromId, setFromId] = useState(sorted[1]?.id ?? sorted[0]?.id ?? "");
  const [toId, setToId] = useState(currentDocumentId || sorted[0]?.id || "");

  const from = sorted.find((v) => v.id === fromId);
  const to = sorted.find((v) => v.id === toId);

  const diff = useMemo(() => {
    if (!from || !to) return [];
    const beforeBullets = listCvBullets(normalizeCvContent(from.content));
    const afterBullets = listCvBullets(normalizeCvContent(to.content));
    return diffLines(beforeBullets, afterBullets);
  }, [from, to]);

  if (sorted.length < 2) {
    return <p className="p-3 text-xs text-slate-500">Save at least two versions to compare changes.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <select
          value={fromId}
          onChange={(event) => setFromId(event.target.value)}
          className="flex-1 rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-slate-200"
        >
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>v{v.version_no} — {normalizeCvContent(v.content).title}</option>
          ))}
        </select>
        <span className="text-slate-500">→</span>
        <select
          value={toId}
          onChange={(event) => setToId(event.target.value)}
          className="flex-1 rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-slate-200"
        >
          {sorted.map((v) => (
            <option key={v.id} value={v.id}>v{v.version_no} — {normalizeCvContent(v.content).title}</option>
          ))}
        </select>
      </div>

      <div className="diff-cols overflow-hidden rounded-lg border border-[#1e293b]">
        <div className="diff-col old">
          <p className="diff-col-label">Removed</p>
          {diff.filter((d) => d.type !== "added").map((d, i) => (
            <p key={i} className={`diff-text ${d.type === "removed" ? "old-text" : ""}`}>{d.text}</p>
          ))}
        </div>
        <div className="diff-col new">
          <p className="diff-col-label">Added</p>
          {diff.filter((d) => d.type !== "removed").map((d, i) => (
            <p key={i} className={`diff-text ${d.type === "added" ? "new-text" : ""}`}>{d.text}</p>
          ))}
        </div>
      </div>
      {diff.every((d) => d.type === "same") && (
        <p className="text-center text-xs text-slate-500">No bullet-level changes between these versions.</p>
      )}
    </div>
  );
}
