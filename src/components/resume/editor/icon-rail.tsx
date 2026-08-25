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
      className="flex shrink-0 flex-row gap-1 border-b border-[#1e293b] p-2 lg:w-[46px] lg:flex-col lg:border-b-0 lg:border-r lg:py-4"
      style={{ background: "#070b14" }}
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
              className={`nav-rail-btn ${active ? "active" : ""} flex size-[38px] items-center justify-center rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)] ${
                matchesFilter ? (active ? "text-[#a5b4fc]" : "text-[#4e6280] hover:text-[#94a3b8]") : "text-[#2a3648] opacity-40"
              } ${isHidden ? "opacity-40" : ""}`}
            >
              <OpsIcon name={section.icon} size={17} />
              <span
                className={`absolute right-1.5 top-1.5 size-1.5 rounded-full ${filled ? "bg-emerald-400" : "bg-slate-700"}`}
              />
            </button>
            <span className="nav-rail-tip">{section.label}</span>
          </div>
        );
      })}
    </div>
  );
}
