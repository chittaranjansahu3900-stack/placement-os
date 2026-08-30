"use client";

import { useEffect, type ReactNode } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";

export function RightDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel panel-slide-in-right">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#4f46e5]">
            <OpsIcon name="sparkles" size={13} />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800"
          >
            <OpsIcon name="x" size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3.5">{children}</div>
      </div>
    </>
  );
}
