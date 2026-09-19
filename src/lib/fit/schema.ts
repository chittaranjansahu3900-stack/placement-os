// Fit brief — shapes shared by the route, the actions and the UI.
// Design record: docs/FIT-BRIEF-SPEC.md.

export type FitCriterionKind = "must" | "nice";

export interface FitCriterion {
  id: string;
  kind: FitCriterionKind;
  text: string;
  // The model's own restatement of how it will read this line, shown next to the
  // criterion so the recruiter fixes wording, not verdicts.
  interpretation?: string;
}

export type FitVerdict = "strong" | "likely" | "partial" | "weak" | "insufficient_evidence";

export type FitEvidenceStatus = "met" | "partial" | "not_found";

export interface FitEvidence {
  criterionId: string;
  status: FitEvidenceStatus;
  claim: string;
  // Where the quote came from, e.g. "CV · Acme Systems · b1" or "Profile sheet · total_work_ex_months".
  source: string;
  // Verbatim text from the packet. Validated as a substring of the model input; dropped otherwise.
  quote: string;
}

export interface FitBrief {
  verdict: FitVerdict;
  summary: string;
  mustHaves: FitEvidence[];
  niceToHaves: FitEvidence[];
  probes: string[];
  excluded: string[];
  degraded: boolean;
}

export const FIT_VERDICTS: readonly FitVerdict[] = ["strong", "likely", "partial", "weak", "insufficient_evidence"];

export const FIT_VERDICT_LABEL: Record<FitVerdict, string> = {
  strong: "Strong fit",
  likely: "Likely fit",
  partial: "Partial",
  weak: "Weak fit",
  insufficient_evidence: "Insufficient evidence",
};

// What the model is told it cannot see. Stored on every brief so the UI can show it and so a
// later change to get_fit_input() has to update this list consciously.
export const FIT_EXCLUDED_FIELDS = [
  "name",
  "gender",
  "age / date of birth",
  "phone",
  "personal email",
  "LinkedIn / website",
  "photo",
  "defaults count",
  "placement status",
  "section / display order",
  "hobbies and languages",
] as const;

const MAX_CRITERIA = 12;
const MAX_TEXT = 300;

export function normalizeCriteria(value: unknown): FitCriterion[] {
  if (!Array.isArray(value)) return [];
  const out: FitCriterion[] = [];
  for (const [index, raw] of value.entries()) {
    if (out.length >= MAX_CRITERIA) break;
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const text = typeof row.text === "string" ? row.text.trim().slice(0, MAX_TEXT) : "";
    if (!text) continue;
    const kind: FitCriterionKind = row.kind === "nice" ? "nice" : "must";
    const id = typeof row.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(row.id) ? row.id : `c${index + 1}`;
    const interpretation =
      typeof row.interpretation === "string" ? row.interpretation.trim().slice(0, MAX_TEXT) : undefined;
    out.push({ id, kind, text, ...(interpretation ? { interpretation } : {}) });
  }
  return out;
}

// Whitespace-insensitive substring check. The model is asked for verbatim quotes, but JSON
// round-trips and line wrapping make exact byte equality too strict to be useful.
function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function quoteAppearsIn(quote: string, haystack: string): boolean {
  const q = squash(quote);
  if (q.length < 3) return false;
  return squash(haystack).includes(q);
}

function str(value: unknown, max = 600): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseEvidence(
  value: unknown,
  criteria: FitCriterion[],
  packetText: string,
  onDrop: () => void,
): FitEvidence[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(criteria.map((c) => c.id));
  const out: FitEvidence[] = [];
  for (const raw of value.slice(0, MAX_CRITERIA)) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const criterionId = str(row.criterionId, 40);
    if (!known.has(criterionId)) continue;
    const statusRaw = str(row.status, 20);
    const status: FitEvidenceStatus =
      statusRaw === "met" || statusRaw === "partial" ? statusRaw : "not_found";
    let quote = str(row.quote);
    let source = str(row.source, 120);
    if (status !== "not_found") {
      if (!quote || !quoteAppearsIn(quote, packetText)) {
        // A supporting quote that isn't in the packet is exactly the failure this feature
        // exists to prevent. Keep the claim visible but downgrade it and flag the brief.
        onDrop();
        quote = "";
        source = source ? `${source} · quote not found in packet` : "quote not found in packet";
        out.push({ criterionId, status: "not_found", claim: str(row.claim), source, quote });
        continue;
      }
    }
    out.push({ criterionId, status, claim: str(row.claim), source, quote });
  }
  return out;
}

export class FitParseError extends Error {}

// Parses the model's JSON reply into a FitBrief. Throws FitParseError when the reply isn't the
// shape we asked for; degrades (never throws) when individual quotes fail validation.
export function parseFitBrief(raw: string, criteria: FitCriterion[], packetText: string): FitBrief {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(cleaned) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    parsed = value as Record<string, unknown>;
  } catch {
    throw new FitParseError("Model reply was not a JSON object");
  }

  const verdictRaw = str(parsed.verdict, 40);
  if (!FIT_VERDICTS.includes(verdictRaw as FitVerdict)) {
    throw new FitParseError(`Unknown verdict "${verdictRaw}"`);
  }

  let degraded = false;
  const markDegraded = () => {
    degraded = true;
  };
  const mustHaves = parseEvidence(parsed.mustHaves, criteria.filter((c) => c.kind === "must"), packetText, markDegraded);
  const niceToHaves = parseEvidence(parsed.niceToHaves, criteria.filter((c) => c.kind === "nice"), packetText, markDegraded);

  // Every must-have gets a row, even if the model skipped it: a missing row reads as "not
  // assessed", which is more honest than silently narrowing the criteria.
  const seen = new Set(mustHaves.map((e) => e.criterionId));
  for (const c of criteria) {
    if (c.kind === "must" && !seen.has(c.id)) {
      degraded = true;
      mustHaves.push({ criterionId: c.id, status: "not_found", claim: "Not assessed by the model", source: "", quote: "" });
    }
  }

  const probes = Array.isArray(parsed.probes)
    ? parsed.probes.map((p) => str(p, 300)).filter(Boolean).slice(0, 5)
    : [];

  return {
    verdict: verdictRaw as FitVerdict,
    summary: str(parsed.summary, 500) || "No summary returned.",
    mustHaves,
    niceToHaves,
    probes,
    excluded: [...FIT_EXCLUDED_FIELDS],
    degraded,
  };
}

// Derives the verdict from the evidence table so the headline can never disagree with the rows
// underneath it. The model's own verdict is used only as a tie-breaker between likely/partial.
export function reconcileVerdict(brief: FitBrief, hasWorkHistory: boolean): FitVerdict {
  const total = brief.mustHaves.length;
  if (total === 0) return brief.verdict;
  const met = brief.mustHaves.filter((e) => e.status === "met").length;
  const partial = brief.mustHaves.filter((e) => e.status === "partial").length;
  if (!hasWorkHistory && met + partial === 0) return "insufficient_evidence";
  if (met === total || (total >= 4 && met === total - 1)) return "strong";
  if (met + partial >= Math.ceil(total * 0.6)) return brief.verdict === "partial" ? "partial" : "likely";
  if (met + partial >= 1) return "partial";
  return "weak";
}
