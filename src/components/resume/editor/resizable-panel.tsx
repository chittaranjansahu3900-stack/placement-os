"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";

const STORAGE_KEY = "cv-studio-panel-width";
const MIN_WIDTH = 300;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 420;

export function ResizablePanel({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    // Reading localStorage during render would mismatch the server-rendered
    // default width, so this intentionally applies the persisted width only
    // after mount, on the client.
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored && stored >= MIN_WIDTH && stored <= MAX_WIDTH) setWidth(stored);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    function onMove(event: MouseEvent) {
      if (!startRef.current) return;
      const delta = event.clientX - startRef.current.x;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startRef.current.width + delta));
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
      startRef.current = null;
      setWidth((current) => {
        localStorage.setItem(STORAGE_KEY, String(current));
        return current;
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="hidden shrink-0 flex-col items-center justify-center border-r border-[#1e293b] bg-[#0f172a] px-1 hover:bg-[#111c2e] lg:flex"
        title="Expand form panel"
      >
        <OpsIcon name="chevron-right" size={12} className="mb-2 text-slate-500" />
        <span className="editor-collapsed-hint">Form panel collapsed</span>
      </button>
    );
  }

  return (
    <>
      <div
        className="cv-form-panel min-w-0 flex-1 space-y-4 overflow-y-auto p-4 lg:flex-none lg:p-5"
        style={{ ["--panel-width" as string]: `${width}px` }}
      >
        <div className="hidden items-center justify-end lg:flex">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse form panel"
            className="mb-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-600 hover:text-slate-400"
          >
            <OpsIcon name="chevron-right" size={11} className="rotate-180" />
            Collapse
          </button>
        </div>
        {children}
      </div>
      <div
        className={`resize-handle hidden lg:block ${dragging ? "dragging" : ""}`}
        onMouseDown={(event) => {
          startRef.current = { x: event.clientX, width };
          setDragging(true);
        }}
      />
    </>
  );
}
