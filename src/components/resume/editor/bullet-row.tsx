"use client";

import { useEffect, useRef, useState } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";
import { BULLET_MAX, inputClass, wrapSelection } from "./shared";
import type { CvBullet } from "@/types/domain";

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function BulletRow({
  bullet, onChange, onRemove, dataField, documentId,
}: {
  bullet: CvBullet;
  onChange: (text: string) => void;
  onRemove: () => void;
  dataField?: string;
  documentId: string;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [improving, setImproving] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    autoGrow(el);
    if (!el) return;

    // Re-measure once the real webfont swaps in — the fallback font can wrap
    // this text onto a different number of lines than the final font does,
    // which would otherwise leave the textarea a stale, clipped height.
    document.fonts?.ready?.then(() => autoGrow(el));

    // Re-measure when the panel is resized (the resizable form panel changes
    // this textarea's width, which changes how the text wraps).
    const container = el.closest(".cv-form-panel") ?? el.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(() => autoGrow(el));
    observer.observe(container);
    return () => observer.disconnect();
  }, [bullet.text]);

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
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <textarea
        ref={inputRef}
        data-field={dataField}
        value={bullet.text}
        onChange={(e) => onChange(e.target.value.slice(0, BULLET_MAX))}
        maxLength={BULLET_MAX}
        rows={1}
        className={`${inputClass} mb-1.5 resize-none overflow-hidden leading-snug`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("**")} className="flex size-6 items-center justify-center rounded border border-slate-200 text-[11px] font-bold text-slate-600 hover:border-slate-300">
            B
          </button>
          <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("_")} className="flex size-6 items-center justify-center rounded border border-slate-200 text-[11px] italic text-slate-600 hover:border-slate-300">
            I
          </button>
          <button type="button" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("++")} className="flex size-6 items-center justify-center rounded border border-slate-200 text-[11px] underline text-slate-600 hover:border-slate-300">
            U
          </button>
          <button type="button" title="Strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("~~")} className="flex size-6 items-center justify-center rounded border border-slate-200 text-[11px] line-through text-slate-600 hover:border-slate-300">
            S
          </button>
          <button
            type="button"
            onClick={improve}
            disabled={improving || !bullet.text.trim()}
            className="ml-1 flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
          >
            <OpsIcon name="sparkles" size={10} />
            {improving ? "Improving…" : "Improve"}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">{bullet.text.length}/{BULLET_MAX}</span>
          <button type="button" onClick={onRemove} className="text-[#ef4444] hover:text-red-700">
            <OpsIcon name="x" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
