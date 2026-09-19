"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OpsIcon } from "@/components/shared/ops-icon";

type Result = { generated: number; remaining: number; results: Array<{ ok: boolean; error?: string }> };

export function FitGenerateButton({ jdId, pending, disabled }: { jdId: string; pending: number; disabled?: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  function run() {
    setStatus("Reading packets…");
    start(async () => {
      try {
        const response = await fetch(`/api/jds/${jdId}/fit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const data = (await response.json()) as Result & { error?: string };
        if (!response.ok) {
          setStatus(data.error ?? "Failed");
          return;
        }
        const failed = data.results.filter((r) => !r.ok).length;
        setStatus(
          `${data.generated} brief${data.generated === 1 ? "" : "s"} generated` +
            (failed ? `, ${failed} failed` : "") +
            (data.remaining ? `, ${data.remaining} more to go — run again` : ""),
        );
        router.refresh();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {status && <span className="text-xs text-slate-400">{status}</span>}
      <button type="button" onClick={run} disabled={busy || disabled || pending === 0} className="ops-button-primary text-xs disabled:opacity-50">
        <OpsIcon name={busy ? "clock" : "sparkles"} size={13} />
        <span>{busy ? "Generating…" : pending > 0 ? `Generate ${Math.min(pending, 25)} brief${pending === 1 ? "" : "s"}` : "All briefs current"}</span>
      </button>
    </div>
  );
}
