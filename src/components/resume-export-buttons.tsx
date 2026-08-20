"use client";

import { useState } from "react";
import type { CvContent } from "@/types/domain";

export function ResumeExportButtons({ fileName, content, templateId = "placement-cell-v2" }: { fileName: string; content: CvContent; templateId?: string }) {
  const [exporting, setExporting] = useState(false);

  async function exportDocx() {
    setExporting(true);
    try {
      const { buildResumeDocx } = await import("@/lib/resume-docx");
      const blob = await buildResumeDocx(content, templateId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName.replace(/[^a-z0-9_-]+/gi, "_") || "Placement_CV"}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="rounded-md bg-white px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-neutral-200">Print / Save PDF</button>
      <button type="button" onClick={exportDocx} disabled={exporting} className="rounded-md border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50">
        {exporting ? "Building DOCX…" : "Download Word (.docx)"}
      </button>
    </div>
  );
}
