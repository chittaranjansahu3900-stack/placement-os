import type { FitCriterion } from "@/lib/fit/schema";

// Rendering the packet as labelled lines does two things: it gives the model a stable source id
// to cite ("CV · Acme Systems · b2"), and it gives parseFitBrief() a single string to validate
// quotes against. Keep the two in sync — the same text goes to the model and to the validator.

export interface FitInputPayload {
  application_id: string;
  jd: {
    role_title: string;
    grade: string | null;
    locations: string[];
    eligible_branches: string[];
    eligible_specializations: string[];
    min_cgpa: number | null;
  };
  profile: {
    total_work_ex_months: number;
    prior_employers: unknown;
    graduation_details: unknown;
    pg_details: unknown;
    tenth_twelfth_details: unknown;
    credentials: unknown;
    other_qualifications: string | null;
  };
  cv: null | {
    template_id: string;
    content: Record<string, unknown>;
  };
}

function flat(value: unknown, depth = 0): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => flat(v, depth + 1)).filter(Boolean).join("; ");
  if (typeof value === "object" && depth < 4) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const rendered = flat(v, depth + 1);
        return rendered ? `${k}: ${rendered}` : "";
      })
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

type Entry = { company?: string; name?: string; role?: string; period?: string; bullets?: Array<{ id?: string; text?: string }> };

function renderEntries(label: string, rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const lines: string[] = [];
  for (const raw of rows as Entry[]) {
    const head = raw.company ?? raw.name ?? "";
    if (!head && !raw.role) continue;
    lines.push(`[${label} · ${head || raw.role}] ${[raw.role, raw.period].filter(Boolean).join(" · ")}`);
    for (const [i, b] of (raw.bullets ?? []).entries()) {
      if (b?.text) lines.push(`[${label} · ${head || raw.role} · b${i + 1}] ${b.text}`);
    }
  }
  return lines;
}

export function renderPacketText(input: FitInputPayload): string {
  const p = input.profile;
  const lines: string[] = [
    `[Profile sheet · total_work_ex_months] ${p.total_work_ex_months}`,
    `[Profile sheet · prior_employers] ${flat(p.prior_employers)}`,
    `[Profile sheet · pg_details] ${flat(p.pg_details)}`,
    `[Profile sheet · graduation_details] ${flat(p.graduation_details)}`,
    `[Profile sheet · tenth_twelfth_details] ${flat(p.tenth_twelfth_details)}`,
    `[Profile sheet · credentials] ${flat(p.credentials)}`,
    `[Profile sheet · other_qualifications] ${p.other_qualifications ?? ""}`,
  ];
  if (input.cv) {
    const c = input.cv.content;
    const pi = (c.personalInfo ?? {}) as Record<string, unknown>;
    lines.push(`[CV · headline] ${flat(pi.headline)}`);
    lines.push(`[CV · summary] ${flat(pi.summary)}`);
    lines.push(...renderEntries("CV", c.experience));
    lines.push(...renderEntries("CV · project", c.projects));
    lines.push(...renderEntries("CV · position", c.positions));
    lines.push(`[CV · academics] ${flat(c.academics)}`);
    lines.push(`[CV · skills] ${flat(c.skills)}`);
    lines.push(`[CV · certifications] ${flat(c.certifications)}`);
    lines.push(`[CV · awards] ${flat(c.awards)}`);
    lines.push(`[CV · publications] ${flat(c.publications)}`);
  } else {
    lines.push("[CV] No CV was attached to this application.");
  }
  return lines.filter((l) => !/\]\s*$/.test(l)).join("\n");
}

export const FIT_SYSTEM_PROMPT = `You read one applicant's placement packet against a recruiter's plain-language hiring criteria and return a structured fit brief. You are a careful reader, not a decision-maker: the recruiter shortlists, you show them where to look.

Rules that are not negotiable:
1. Evidence only. For every criterion, either cite a verbatim quote from the packet (copy the text exactly as it appears after a [source] label, and put that label in "source") or mark it "not_found". Never paraphrase into the quote field. Never infer a credential from a job title, an employer's reputation, or a school's name.
2. Ownership is not participation. "Led", "owned", "defined", "launched" with a measurable outcome is "met". "Worked on", "contributed to", "part of a team that" is at most "partial". Say which in the claim.
3. Scope matters. A student project with real users is not the same as a shipped product at an employer. When it is the closest evidence, mark the criterion "partial" or "not_found" and say "closest evidence, not a pass" in the claim.
4. Freshers are not weak. If the packet has no post-graduation work history and the criteria are about work, the verdict is "insufficient_evidence", not "weak".
5. Deterministic lines are deterministic. A criterion like "at least N months of work experience" is read from [Profile sheet · total_work_ex_months] with no judgment.
6. You cannot see, and must not guess, the applicant's name, gender, age, contact details, photo, defaults record or placement status. Do not comment on them. Do not use words that imply them.
7. Probes come from gaps. Each interview question must target a "partial" or "not_found" row, or a number in a quote whose individual scope is unclear.
8. Return JSON only. No preamble, no markdown fences.

Output shape:
{
  "verdict": "strong" | "likely" | "partial" | "weak" | "insufficient_evidence",
  "summary": "one or two sentences, plain language, no scores",
  "mustHaves": [{ "criterionId": "...", "status": "met" | "partial" | "not_found", "claim": "...", "source": "...", "quote": "..." }],
  "niceToHaves": [{ same shape }],
  "probes": ["...", "...", "..."]
}
Include one row per criterion, in the order given. Verdict guide: strong = every must-have met (or all but one of four or more); likely = most met or partial; partial = some; weak = essentially none, with real work history present; insufficient_evidence = nothing to assess against.`;

export function buildFitUserPrompt(criteria: FitCriterion[], packetText: string, roleTitle: string): string {
  const must = criteria.filter((c) => c.kind === "must").map((c) => `- ${c.id}: ${c.text}`).join("\n");
  const nice = criteria.filter((c) => c.kind === "nice").map((c) => `- ${c.id}: ${c.text}`).join("\n");
  return [
    `Role: ${roleTitle}`,
    "",
    "Must-haves:",
    must || "- (none)",
    "",
    "Nice-to-haves:",
    nice || "- (none)",
    "",
    "Packet (each line starts with its [source] label; quote text exactly as written after the label):",
    packetText,
  ].join("\n");
}

// Second, cheaper call: turn each recruiter line into a one-sentence reading shown beside it
// in the criteria editor. Same rules, no packet.
export const FIT_INTERPRET_SYSTEM_PROMPT = `You restate each hiring criterion as one sentence describing exactly what evidence in a CV or profile sheet would satisfy it, and what would not. Be concrete ("a bullet naming a system with a throughput or user figure"; "a course project does not count"). If the line is deterministic (a number, a degree, a location), say it is read from a profile field with no judgment. Return JSON only: {"interpretations": [{"id": "...", "interpretation": "..."}]}.`;
