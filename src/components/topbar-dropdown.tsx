"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function TopbarDropdown({
  trigger,
  children,
  align = "left",
  panelClassName = "",
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        {trigger(open)}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-[#334155] bg-[#0f172a] shadow-[0_6px_20px_rgba(0,0,0,0.3)] ${align === "right" ? "right-0" : "left-0"} ${panelClassName}`}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}
