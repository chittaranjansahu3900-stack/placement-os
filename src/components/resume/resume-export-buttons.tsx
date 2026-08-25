"use client";

import { useState } from "react";
import { OpsIcon } from "@/components/shared/ops-icon";
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
    <div className="flex flex-wrap items-center gap-2.5 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="ops-button-primary text-xs"
      >
        <OpsIcon name="printer" size={13} />
        Print / Save PDF
      </button>
      <button
        type="button"
        onClick={exportDocx}
        disabled={exporting}
        className="ops-button-secondary text-xs"
      >
        <OpsIcon name="download" size={13} />
        {exporting ? "Building DOCX…" : "Download Word (.docx)"}
      </button>
    </div>
  );
}
