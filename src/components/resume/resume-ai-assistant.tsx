"use client";

import { useState } from "react";
import { normalizeCvContent } from "@/lib/resume";
import { OpsIcon } from "@/components/shared/ops-icon";
import type { CvContent } from "@/types/domain";

type Purpose = "writing_assist" | "cv_import" | "quality_review";

const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none transition-colors focus:border-blue-400 focus:ring-1 focus:ring-blue-400";
const secondaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 disabled:opacity-40";
const primaryBtnClass =
  "inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700";

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
    <section className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-blue-700">
        <OpsIcon name="sparkles" size={15} className="text-blue-600" />
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-700">
          AI Placement CV Assistant
        </h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Multi-provider intelligence: Groq bullet rewrites, Gemini CV structurer, Claude quality audit. PII is masked before provider calls.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Fact-Safe Bullet Rewrite (Groq)
            <textarea
              value={writingInput}
              onChange={(event) => setWritingInput(event.target.value)}
              maxLength={12_000}
              placeholder="Paste one factual achievement bullet (e.g. Led team of 5 to develop...)"
              className={`${fieldClass} mt-1 min-h-20`}
            />
          </label>
          <button
            type="button"
            disabled={!writingInput.trim() || busy !== null}
            onClick={() => run("writing_assist", writingInput)}
            className={`${secondaryBtnClass} mt-2`}
          >
            <OpsIcon name="sparkles" size={13} />
            {busy === "writing_assist" ? "Rewriting…" : "Rewrite Bullet"}
          </button>
        </div>

        <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer font-mono text-xs font-semibold text-slate-700 hover:text-slate-900">
            Import Pasted CV Text (Gemini)
          </summary>
          <p className="mt-2 font-mono text-[11px] text-slate-500">
            Paste text extracted locally from a PDF/DOCX.
          </p>
          <textarea
            value={importInput}
            onChange={(event) => setImportInput(event.target.value)}
            maxLength={50_000}
            placeholder="Paste existing CV plain text"
            className={`${fieldClass} mt-2 min-h-28`}
          />
          <button
            type="button"
            disabled={!importInput.trim() || busy !== null}
            onClick={() => run("cv_import", importInput)}
            className={`${secondaryBtnClass} mt-2`}
          >
            <OpsIcon name="upload" size={13} />
            {busy === "cv_import" ? "Structuring…" : "Structure Imported CV"}
          </button>
        </details>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("quality_review", JSON.stringify(content))}
          className={`${secondaryBtnClass} w-full justify-center`}
        >
          <OpsIcon name="check-shield" size={13} />
          {busy === "quality_review" ? "Running Audit…" : "Run Quality Review with Claude"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2.5 font-mono text-xs text-red-700">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3.5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-blue-600">{provider}</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed">
            {result}
          </pre>
          {lastPurpose === "writing_assist" && (
            <button type="button" onClick={() => onApplyBullet(result)} className={`${primaryBtnClass} mt-3`}>
              <OpsIcon name="plus" size={13} />
              Add as Experience Bullet
            </button>
          )}
          {lastPurpose === "cv_import" && (
            <button type="button" onClick={applyImport} className={`${primaryBtnClass} mt-3`}>
              <OpsIcon name="check" size={13} />
              Apply Imported Sections for Review
            </button>
          )}
        </div>
      )}
    </section>
  );
}
