"use client";

import { useState } from "react";
import { replaceInContent } from "@/lib/resume";
import { inputClass, topbarBtnPrimaryClass } from "../shared";
import type { CvContent } from "@/types/domain";

export function FindReplacePanel({
  content,
  onApply,
}: {
  content: CvContent;
  onApply: (next: CvContent) => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [lastCount, setLastCount] = useState<number | null>(null);

  function handleReplaceAll() {
    const { next, count } = replaceInContent(content, find, replace);
    setLastCount(count);
    if (count > 0) onApply(next);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.05em] text-slate-500">Find</label>
        <input value={find} onChange={(e) => setFind(e.target.value)} className={inputClass} placeholder="Text to find across your whole CV" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.05em] text-slate-500">Replace with</label>
        <input value={replace} onChange={(e) => setReplace(e.target.value)} className={inputClass} placeholder="Replacement text" />
      </div>
      <button type="button" disabled={!find} onClick={handleReplaceAll} className={`w-full justify-center ${topbarBtnPrimaryClass}`}>
        Replace all
      </button>
      {lastCount !== null && (
        <p className="text-xs text-slate-500">
          {lastCount > 0 ? `Replaced ${lastCount} occurrence(s).` : "No matches found."}
        </p>
      )}
    </div>
  );
}
