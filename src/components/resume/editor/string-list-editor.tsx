"use client";

import { OpsIcon } from "@/components/shared/ops-icon";
import { inputClass, addButtonClass } from "./shared";

export function StringListEditor({
  items, onChange, placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(event) => onChange(items.map((value, i) => (i === index ? event.target.value : value)))}
            placeholder={placeholder}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="shrink-0 text-[#ef4444] hover:text-red-700"
          >
            <OpsIcon name="x" size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className={addButtonClass}>
        + Add
      </button>
    </div>
  );
}
