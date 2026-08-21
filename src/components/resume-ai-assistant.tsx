"use client";

import { useState } from "react";
import { normalizeCvContent } from "@/lib/resume";
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
    <section className="rounded-lg border border-violet-900 bg-violet-950/30 p-4">
      <h2 className="text-sm font-semibold text-violet-200">AI Resume Assistant</h2>
      <p className="mt-1 text-xs text-violet-300/70">
        Groq rewrites, Gemini structures pasted CV text, and Claude performs the quality review.
        Contact details are replaced with reversible placeholders before any provider call. AI never
        saves automatically—review and use the main Save CV button.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-300">
            Fact-safe bullet rewrite (Groq)
            <textarea
              value={writingInput}
              onChange={(event) => setWritingInput(event.target.value)}
              maxLength={12_000}
              placeholder="Paste one factual achievement bullet"
              className="mt-1 min-h-20 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            type="button"
            disabled={!writingInput.trim() || busy !== null}
            onClick={() => run("writing_assist", writingInput)}
            className="mt-2 rounded-md border border-violet-700 px-3 py-2 text-xs text-violet-200 disabled:opacity-40"
          >
            {busy === "writing_assist" ? "Rewriting…" : "Rewrite bullet"}
          </button>
        </div>

        <details className="rounded-md border border-neutral-800 p-3">
          <summary className="cursor-pointer text-xs font-medium text-neutral-300">
            Import pasted CV text (Gemini)
          </summary>
          <p className="mt-2 text-xs text-neutral-500">
            Paste text extracted locally from a PDF/DOCX. Binary files are not sent because PII must
            be masked before provider processing.
          </p>
          <textarea
            value={importInput}
            onChange={(event) => setImportInput(event.target.value)}
            maxLength={50_000}
            placeholder="Paste existing CV text"
            className="mt-2 min-h-32 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
          <button
            type="button"
            disabled={!importInput.trim() || busy !== null}
            onClick={() => run("cv_import", importInput)}
            className="mt-2 rounded-md border border-violet-700 px-3 py-2 text-xs text-violet-200 disabled:opacity-40"
          >
            {busy === "cv_import" ? "Structuring…" : "Structure imported CV"}
          </button>
        </details>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("quality_review", JSON.stringify(content))}
          className="rounded-md border border-violet-700 px-3 py-2 text-xs text-violet-200 disabled:opacity-40"
        >
          {busy === "quality_review" ? "Reviewing…" : "Run quality review with Claude"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-md bg-red-950 p-2 text-xs text-red-300">{error}</p>}
      {result && (
        <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">{provider}</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs text-neutral-200">
            {result}
          </pre>
          {lastPurpose === "writing_assist" && (
            <button
              type="button"
              onClick={() => onApplyBullet(result)}
              className="mt-3 rounded-md bg-violet-700 px-3 py-2 text-xs text-white"
            >
              Add as experience bullet
            </button>
          )}
          {lastPurpose === "cv_import" && (
            <button
              type="button"
              onClick={applyImport}
              className="mt-3 rounded-md bg-violet-700 px-3 py-2 text-xs text-white"
            >
              Apply imported sections for review
            </button>
          )}
        </div>
      )}
    </section>
  );
}
