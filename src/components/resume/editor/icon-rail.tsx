"use client";

import { OpsIcon } from "@/components/shared/ops-icon";
import { RAIL_SECTIONS, isSectionFilled } from "./shared";
import type { CvContent } from "@/types/domain";

export function IconRail({
  content,
  sectionFilter,
  activeKey,
  onScrollToSection,
}: {
  content: CvContent;
  sectionFilter: string;
  activeKey: string | null;
  onScrollToSection: (key: string) => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-row gap-1 border-b border-slate-200 p-2 lg:w-[46px] lg:flex-col lg:border-b-0 lg:border-r lg:py-4"
      style={{ background: "#f8fafc" }}
    >
      {RAIL_SECTIONS.map((section) => {
        const matchesFilter = !sectionFilter.trim() || section.label.toLowerCase().includes(sectionFilter.trim().toLowerCase());
        const isHidden = section.toggleable && content.hiddenSections.includes(section.key);
        const filled = isSectionFilled(content, section.key);
        const active = activeKey === section.key;
        return (
          <div key={section.key} className="nav-rail-wrap">
            <button
              type="button"
              data-rail-section={section.key}
              onClick={() => onScrollToSection(section.key)}
              className={`nav-rail-btn ${active ? "active" : ""} flex size-[38px] items-center justify-center rounded-lg transition-colors hover:bg-[rgba(15,23,42,0.05)] ${
                matchesFilter ? (active ? "text-[#4f46e5]" : "text-slate-400 hover:text-slate-600") : "text-slate-300 opacity-40"
              } ${isHidden ? "opacity-40" : ""}`}
            >
              <OpsIcon name={section.icon} size={17} />
              <span
                className={`absolute right-1.5 top-1.5 size-1.5 rounded-full ${filled ? "bg-emerald-500" : "bg-slate-300"}`}
              />
            </button>
            <span className="nav-rail-tip">{section.label}</span>
          </div>
        );
      })}
    </div>
  );
}
