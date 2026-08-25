"use client";

import { useRef, useState } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";
import { BULLET_MAX, inputClass, wrapSelection } from "./shared";
import type { CvBullet } from "@/types/domain";

export function BulletRow({
  bullet, onChange, onRemove, dataField, documentId,
}: {
  bullet: CvBullet;
  onChange: (text: string) => void;
  onRemove: () => void;
  dataField?: string;
  documentId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [improving, setImproving] = useState(false);

  function applyMarker(marker: string) {
    const input = inputRef.current;
    if (!input) return;
    const { next, selStart, selEnd } = wrapSelection(input, bullet.text, marker);
    onChange(next.slice(0, BULLET_MAX));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(selStart, selEnd);
    });
  }

  async function improve() {
    if (!bullet.text.trim() || improving) return;
    setImproving(true);
    try {
      const response = await fetch("/api/resume/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "writing_assist", input: bullet.text, cvDocumentId: documentId }),
      });
      const payload = (await response.json()) as { output?: string };
      if (response.ok && payload.output) onChange(payload.output.slice(0, BULLET_MAX));
    } catch {
      // Best-effort — matches this app's existing silent-AI-failure convention.
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#334155] bg-[#0f172a] p-2">
      <input
        ref={inputRef}
        data-field={dataField}
        value={bullet.text}
        onChange={(e) => onChange(e.target.value.slice(0, BULLET_MAX))}
        maxLength={BULLET_MAX}
        className={`${inputClass} mb-1.5`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("**")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] font-bold text-slate-300 hover:border-slate-600">
            B
          </button>
          <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("_")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] italic text-slate-300 hover:border-slate-600">
            I
          </button>
          <button type="button" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("++")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] underline text-slate-300 hover:border-slate-600">
            U
          </button>
          <button type="button" title="Strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("~~")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] line-through text-slate-300 hover:border-slate-600">
            S
          </button>
          <button
            type="button"
            onClick={improve}
            disabled={improving || !bullet.text.trim()}
            className="ml-1 flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40"
          >
            <OpsIcon name="sparkles" size={10} />
            {improving ? "Improving…" : "Improve"}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">{bullet.text.length}/{BULLET_MAX}</span>
          <button type="button" onClick={onRemove} className="text-[#ef4444] hover:text-red-300">
            <OpsIcon name="x" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
