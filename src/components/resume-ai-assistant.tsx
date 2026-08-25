"use client";

import { useState } from "react";
import { normalizeCvContent } from "@/lib/resume";
import { OpsIcon } from "@/components/ops-icon";
import type { CvContent } from "@/types/domain";

type Purpose = "writing_assist" | "cv_import" | "quality_review";

function jsonFromModel(value: string): unknown {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export function ResumeAiAssistant({
  documentId,
  content,
  onApplyBullet,
  onApplyImported,
}: {
  documentId: string;
  content: CvContent;
  onApplyBullet: (bullet: string) => void;
  onApplyImported: (content: CvContent) => void;
}) {
  const [writingInput, setWritingInput] = useState("");
  const [importInput, setImportInput] = useState("");
  const [result, setResult] = useState("");
  const [lastPurpose, setLastPurpose] = useState<Purpose | null>(null);
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Purpose | null>(null);

  async function run(purpose: Purpose, input: string, instruction?: string) {
    setBusy(purpose);
    setError("");
    setResult("");
    try {
      const response = await fetch("/api/resume/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, input, instruction, cvDocumentId: documentId }),
      });
      const payload = (await response.json()) as {
        output?: string;
        provider?: string;
        model?: string;
        piiMaskedCount?: number;
        error?: string;
      };
      if (!response.ok || !payload.output) throw new Error(payload.error ?? "AI request failed");
      setLastPurpose(purpose);
      setResult(payload.output);
      setProvider(`${payload.provider ?? "provider"} · ${payload.model ?? "model"} · ${payload.piiMaskedCount ?? 0} PII value(s) masked`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI request failed");
    } finally {
      setBusy(null);
    }
  }

  function applyImport() {
    try {
      const imported = normalizeCvContent(jsonFromModel(result));
      onApplyImported({
        ...imported,
        personalInfo: {
          ...imported.personalInfo,
          name: content.personalInfo.name,
          email: content.personalInfo.email,
          phone: content.personalInfo.phone,
        },
      });
      setError("");
    } catch {
      setError("The provider response was not valid CV JSON; review it manually instead.");
    }
  }

  return (
    <section className="rounded-lg border border-blue-800/60 bg-slate-900/95 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-blue-300">
        <OpsIcon name="sparkles" size={15} className="text-blue-400" />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-200">
          AI Placement CV Assistant
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Multi-provider intelligence: Groq bullet rewrites, Gemini CV structurer, Claude quality audit. PII is masked before provider calls.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300">
            Fact-Safe Bullet Rewrite (Groq)
            <textarea
              value={writingInput}
              onChange={(event) => setWritingInput(event.target.value)}
              maxLength={12_000}
              placeholder="Paste one factual achievement bullet (e.g. Led team of 5 to develop...)"
              className="ops-input mt-1 min-h-20 w-full font-mono text-xs text-white"
            />
          </label>
          <button
            type="button"
            disabled={!writingInput.trim() || busy !== null}
            onClick={() => run("writing_assist", writingInput)}
            className="ops-button-secondary mt-2 text-xs"
          >
            <OpsIcon name="sparkles" size={13} />
            {busy === "writing_assist" ? "Rewriting…" : "Rewrite Bullet"}
          </button>
        </div>

        <details className="rounded-md border border-slate-750 bg-slate-950/60 p-3">
          <summary className="cursor-pointer font-mono text-xs font-semibold text-slate-300 hover:text-white">
            Import Pasted CV Text (Gemini)
          </summary>
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            Paste text extracted locally from a PDF/DOCX.
          </p>
          <textarea
            value={importInput}
            onChange={(event) => setImportInput(event.target.value)}
            maxLength={50_000}
            placeholder="Paste existing CV plain text"
            className="ops-input mt-2 min-h-28 w-full font-mono text-xs text-white"
          />
          <button
            type="button"
            disabled={!importInput.trim() || busy !== null}
            onClick={() => run("cv_import", importInput)}
            className="ops-button-secondary mt-2 text-xs"
          >
            <OpsIcon name="upload" size={13} />
            {busy === "cv_import" ? "Structuring…" : "Structure Imported CV"}
          </button>
        </details>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("quality_review", JSON.stringify(content))}
          className="ops-button-secondary w-full justify-center text-xs"
        >
          <OpsIcon name="check-shield" size={13} />
          {busy === "quality_review" ? "Running Audit…" : "Run Quality Review with Claude"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-800/80 bg-red-950/80 p-2.5 font-mono text-xs text-red-200">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-md border border-slate-750 bg-slate-950 p-3.5 shadow-inner">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-400">{provider}</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs text-slate-200 leading-relaxed">
            {result}
          </pre>
          {lastPurpose === "writing_assist" && (
            <button
              type="button"
              onClick={() => onApplyBullet(result)}
              className="ops-button-primary mt-3 text-xs"
            >
              <OpsIcon name="plus" size={13} />
              Add as Experience Bullet
            </button>
          )}
          {lastPurpose === "cv_import" && (
            <button
              type="button"
              onClick={applyImport}
              className="ops-button-primary mt-3 text-xs"
            >
              <OpsIcon name="check" size={13} />
              Apply Imported Sections for Review
            </button>
          )}
        </div>
      )}
    </section>
  );
}
