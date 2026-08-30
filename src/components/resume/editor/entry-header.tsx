"use client";

import { OpsIcon } from "@/components/shared/ops-icon";

export function EntryHeader({
  title,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  title: string;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium text-slate-700 hover:text-slate-900">
      <span className="min-w-0 truncate">{title}</span>
      <span
        className="flex shrink-0 items-center gap-1.5"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {onMoveUp && (
          <button
            type="button"
            title="Move up"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMoveUp();
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <OpsIcon name="chevron-up" size={12} />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            title="Move down"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onMoveDown();
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <OpsIcon name="chevron-down" size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="rounded px-1.5 py-0.5 font-mono text-xs text-[#ef4444] hover:bg-red-50 hover:text-red-700 transition-colors"
        >
          Remove
        </button>
        <OpsIcon
          name="chevron-down"
          size={14}
          className="text-slate-500 transition-transform group-open:rotate-180"
        />
      </span>
    </summary>
  );
}
