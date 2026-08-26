"use client";

import { useEffect, type RefObject } from "react";

// Cursivo-style section navigation: clicking a rail icon shows only that
// section — everything else is removed from layout (not just dimmed), so
// there's nothing else to scroll into. Exiting back to the full list is
// handled by the "Show all sections" link in the toolbar row, so this
// component only applies the show/hide effect and renders nothing itself.
export function FocusMode({
  activeKey,
  sectionRefs,
}: {
  activeKey: string;
  sectionRefs: RefObject<Map<string, HTMLElement>>;
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

  return null;
}
