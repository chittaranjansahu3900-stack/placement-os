"use client";

import { useEffect, type RefObject } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";
import { RAIL_SECTIONS } from "../shared";

// Cursivo-style section navigation: clicking a rail icon shows only that
// section — everything else is removed from layout (not just dimmed), so
// there's nothing else to scroll into.
export function FocusMode({
  activeKey,
  sectionRefs,
  onExit,
}: {
  activeKey: string;
  sectionRefs: RefObject<Map<string, HTMLElement>>;
  onExit: () => void;
}) {
  useEffect(() => {
    const map = sectionRefs.current;
    for (const [key, el] of map.entries()) {
      el.style.display = key === activeKey ? "" : "none";
    }
    return () => {
      for (const el of map.values()) el.style.display = "";
    };
  }, [activeKey, sectionRefs]);

  const label = RAIL_SECTIONS.find((s) => s.key === activeKey)?.label ?? activeKey;

  return (
    <div className="sticky top-2 z-30 mb-2 flex items-center justify-between rounded-full border border-[#4f46e5]/40 bg-[#0d1424] px-3 py-1.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
      <span className="flex items-center gap-1.5 text-[#a5b4fc]">
        <OpsIcon name="eye" size={12} />
        Viewing: {label}
      </span>
      <button type="button" onClick={onExit} className="flex items-center gap-1 text-slate-400 hover:text-slate-200">
        <OpsIcon name="layers" size={11} />
        Show all sections
      </button>
    </div>
  );
}
