"use client";

import { OpsIcon } from "@/components/shared/ops-icon";

export function EntryHeader({
  title, onRemove, onMoveUp, onMoveDown,
}: {
  title: string;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium text-slate-200 hover:text-white">
      <span className="min-w-0 truncate">{title}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {onMoveUp && (
          <button
            type="button"
            title="Move up"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMoveUp(); }}
            className="text-slate-500 hover:text-slate-300"
          >
            <OpsIcon name="chevron-up" size={12} />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            title="Move down"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMoveDown(); }}
            className="text-slate-500 hover:text-slate-300"
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
          className="font-mono text-xs text-[#ef4444] hover:text-red-300"
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
