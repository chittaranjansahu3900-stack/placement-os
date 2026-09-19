import {
  availableBlocks,
  lpa,
  months,
  type BatchProfileSnapshot,
  type BlockId,
  type PosterAudience,
  type PosterFormat,
  type PosterOccasion,
} from "@/lib/profile/snapshot";

export interface PosterSpec {
  audience: PosterAudience;
  occasion: PosterOccasion;
  format: PosterFormat;
  title: string;        // "Invitation for Final Placements 2027"
  headline: string;     // one sentence, plain, contains no numbers the snapshot doesn't
  blocks: BlockId[];    // in render order; templates take as many as fit
  leadStat: { label: string; value: string; source: string } | null;
}

// Audience-specific preferences: what to lead with, and which blocks to pull forward.
const AUDIENCE_PREFERENCE: Record<PosterAudience, BlockId[]> = {
  general: ["batch_size", "work_ex_average", "ctc_highlights", "education_branches", "work_ex_sectors", "past_recruiters"],
  finance: ["credentials", "ctc_highlights", "work_ex_sectors", "premier_institutes", "specializations", "past_recruiters"],
  consulting: ["premier_institutes", "work_ex_average", "work_ex_sectors", "ctc_highlights", "past_employers", "past_recruiters"],
  technology: ["premier_institutes", "education_branches", "work_ex_sectors", "past_employers", "ctc_highlights", "past_recruiters"],
  marketing: ["specializations", "education_branches", "work_ex_sectors", "campus_highlights", "ctc_highlights", "past_recruiters"],
  operations: ["education_branches", "work_ex_buckets", "work_ex_sectors", "past_employers", "ctc_highlights", "past_recruiters"],
};

const FORMAT_CAPACITY: Record<PosterFormat, number> = {
  poster_a4: 12,
  linkedin_landscape: 3,
  linkedin_square: 4,
  story: 7,
};

// "PGP 2026–28": finals happen in the end year (2028); summers after the first year (2027).
function seasonLabel(s: BatchProfileSnapshot, occasion: PosterOccasion): string {
  const m = s.batch.name.match(/(\d{4})\s*[–-]\s*(\d{2,4})/);
  if (!m) return s.batch.name;
  const start = Number(m[1]);
  const end = m[2].length === 2 ? Number(`${m[1].slice(0, 2)}${m[2]}`) : Number(m[2]);
  return String(occasion === "summer_placements" ? Math.min(start + 1, end) : end);
}

export function defaultTitle(s: BatchProfileSnapshot, occasion: PosterOccasion): string {
  const year = seasonLabel(s, occasion);
  switch (occasion) {
    case "final_placements":
      return `Invitation for Final Placements ${year}`;
    case "summer_placements":
      return `Invitation for Summer Placements ${year}`;
    case "placement_report":
      return `Final Placements ${year} — Report`;
  }
}

export function pickLeadStat(s: BatchProfileSnapshot, audience: PosterAudience, occasion: PosterOccasion): PosterSpec["leadStat"] {
  const p = s.placements;
  if (occasion === "placement_report" && p?.ctc_median != null) {
    return { label: "Median CTC", value: lpa(p.ctc_median), source: "placements.ctc_median" };
  }
  if (audience === "finance") {
    const creds = Object.values(s.education.professional_credentials).reduce((a, b) => a + b, 0);
    if (creds > 0) return { label: "CA / CFA / FRM holders", value: String(creds), source: "education.professional_credentials" };
  }
  if ((audience === "consulting" || audience === "technology") && s.education.premier_institutes_total > 0) {
    return { label: "From IIT / NIT / BITS", value: String(s.education.premier_institutes_total), source: "education.premier_institutes_total" };
  }
  if (s.work_ex.average_months != null) {
    return { label: "Average work experience", value: months(s.work_ex.average_months), source: "work_ex.average_months" };
  }
  return { label: "Students", value: String(s.size), source: "size" };
}

export function composeDeterministic(
  s: BatchProfileSnapshot,
  audience: PosterAudience,
  occasion: PosterOccasion,
  format: PosterFormat,
): PosterSpec {
  const available = new Set(availableBlocks(s));
  const preferred = AUDIENCE_PREFERENCE[audience].filter((b) => available.has(b));
  const rest = [...available].filter((b) => !preferred.includes(b));
  // Placement stats belong on a report; on an invitation they come after the batch.
  const ordered = occasion === "placement_report" ? [...preferred.filter((b) => b.startsWith("ctc") || b === "recruiter_counts"), ...preferred.filter((b) => !b.startsWith("ctc") && b !== "recruiter_counts"), ...rest] : [...preferred, ...rest];
  const blocks = ordered.slice(0, FORMAT_CAPACITY[format]);
  const legacy = s.institute.facts.legacy_since ? `${new Date().getFullYear() - s.institute.facts.legacy_since}+ years` : null;
  const headline =
    occasion === "placement_report"
      ? `${s.institute.name} — ${s.batch.name} placement season at a glance.`
      : `We look forward to hosting you at ${s.institute.name}${legacy ? `, with a legacy of ${legacy} of developing leaders` : ""}.`;
  return { audience, occasion, format, title: defaultTitle(s, occasion), headline, blocks, leadStat: pickLeadStat(s, audience, occasion) };
}

// ── Numbers guard ──────────────────────────────────────────────────────────────────────────
// Any digit sequence in model-written copy must literally appear somewhere in the snapshot
// (or be a year from the batch name). Otherwise the copy is rejected and the deterministic
// headline is used. This is what makes "the model never types a number" a checked property,
// not a prompt request.

export function snapshotNumberSet(s: BatchProfileSnapshot): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") {
      out.add(String(v));
      out.add(String(Math.round(v)));
      if (v >= 1000) out.add(String(v / 100_000).replace(/\.0+$/, ""));
    } else if (typeof v === "string") {
      for (const m of v.match(/\d+(?:\.\d+)?/g) ?? []) out.add(m);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(s);
  const y = new Date().getFullYear();
  for (let i = y - 2; i <= y + 3; i++) out.add(String(i));
  return out;
}

export function copyUsesOnlySnapshotNumbers(copy: string, s: BatchProfileSnapshot): boolean {
  const allowed = snapshotNumberSet(s);
  const found = copy.match(/\d+(?:\.\d+)?/g) ?? [];
  return found.every((n) => allowed.has(n) || allowed.has(n.replace(/\.0+$/, "")));
}

export function headlineHasNoFigures(copy: string): boolean {
  const y = new Date().getFullYear();
  return (copy.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => /^\d{4}$/.test(n) && Math.abs(Number(n) - y) <= 3);
}

// ── Model pass (optional) ──────────────────────────────────────────────────────────────────

export const COMPOSE_SYSTEM_PROMPT = `You are laying out a B-school placement poster for a specific recruiter audience. You receive the aggregate batch snapshot and the list of blocks that have data. You return JSON only:
{"headline": "<one sentence, no numbers>", "blocks": ["<block ids in render order, from the available list only>"], "leadStatSource": "<a dotted snapshot path from the allowed list, or null>"}
Rules: never write a number in the headline (the template renders numbers from the snapshot); never name a block that is not in the available list; put the two or three blocks this audience cares about first; keep the headline warm and specific to the institute, not generic.`;

export function composeUserPrompt(s: BatchProfileSnapshot, spec: PosterSpec): string {
  const summary = {
    institute: s.institute.name,
    batch: s.batch.name,
    audience: spec.audience,
    occasion: spec.occasion,
    format: spec.format,
    capacity: FORMAT_CAPACITY[spec.format],
    available_blocks: availableBlocks(s),
    lead_stat_options: ["size", "work_ex.average_months", "education.premier_institutes_total", "education.professional_credentials", "placements.ctc_median", "placements.ctc_highest", "placements.recruiters"],
    facts: s.institute.facts,
  };
  return JSON.stringify(summary);
}

export function applyModelComposition(s: BatchProfileSnapshot, base: PosterSpec, raw: string): PosterSpec {
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()) as { headline?: string; blocks?: string[]; leadStatSource?: string | null };
    const available = new Set(availableBlocks(s));
    const blocks = (parsed.blocks ?? []).filter((b): b is BlockId => available.has(b as BlockId)).slice(0, FORMAT_CAPACITY[base.format]);
    // Headlines carry no numbers at all (years excepted): presence in the snapshot is not
    // enough to prove a number is attributed to the right stat, so the template renders every
    // figure itself.
    const headline = typeof parsed.headline === "string" && parsed.headline.trim() && headlineHasNoFigures(parsed.headline)
      ? parsed.headline.trim().slice(0, 220)
      : base.headline;
    return { ...base, headline, blocks: blocks.length ? blocks : base.blocks };
  } catch {
    return base;
  }
}
