"use client";

import type { RefObject } from "react";
import { ResumePreview, type ResumeFieldSpec } from "@/components/shared/resume-preview";
import { OpsIcon } from "@/components/shared/ops-icon";
import { CV_TEMPLATES } from "@/lib/resume-templates";
import { tplPillClass, tplPillActiveClass, zoomBtnClass } from "./shared";
import type { CvContent } from "@/types/domain";

export function PreviewCanvas({
  content,
  templateId,
  onTemplateChange,
  zoom,
  onZoomChange,
  onFitZoom,
  canvasWrapperRef,
  onFieldClick,
}: {
  content: CvContent;
  templateId: string;
  onTemplateChange: (id: string) => void;
  zoom: number;
  onZoomChange: (updater: (current: number) => number) => void;
  onFitZoom: () => void;
  canvasWrapperRef: RefObject<HTMLDivElement | null>;
  onFieldClick: (spec: ResumeFieldSpec) => void;
}) {
  const dotColors = ["#6366f1", "#3b82f6", "#f59e0b"];

  return (
    <div
      ref={canvasWrapperRef}
      className="relative flex-1 bg-[radial-gradient(circle_at_20%_20%,#f1f5f9_0%,#e2e8f0_100%)] p-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:p-8"
    >
      {/* Floating controls bar — template quick-picks + zoom, pinned over the canvas */}
      <div className="sticky top-0 z-20 mx-auto mb-4 flex max-w-[820px] flex-wrap items-center justify-between gap-3 rounded-full border border-slate-200 bg-white/90 px-2 py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)] backdrop-blur-md">
        <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
          {CV_TEMPLATES.map((template, i) => {
            const selected = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                data-cmd={`template-${template.id}`}
                onClick={() => onTemplateChange(template.id)}
                className={selected ? tplPillActiveClass : tplPillClass}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: selected ? "white" : dotColors[i % dotColors.length] }} />
                {template.name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onZoomChange((z) => Math.max(40, z - 10))} className={zoomBtnClass}>
            <OpsIcon name="minus" size={12} />
          </button>
          <span className="w-12 text-center font-mono text-xs text-slate-500">{zoom}%</span>
          <button type="button" onClick={() => onZoomChange((z) => Math.min(150, z + 10))} className={zoomBtnClass}>
            <OpsIcon name="plus" size={12} />
          </button>
          <button
            type="button"
            data-cmd="fit-zoom"
            onClick={onFitZoom}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800"
          >
            Fit
          </button>
        </div>
      </div>

      <div
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
        className="mx-auto max-w-[820px] overflow-hidden rounded shadow-[0_20px_48px_-10px_rgba(0,0,0,0.12),0_10px_20px_-5px_rgba(0,0,0,0.08)]"
      >
        <ResumePreview content={content} templateId={templateId} onFieldClick={onFieldClick} />
      </div>

      <span className="page-count-badge">1 page</span>
    </div>
  );
}
