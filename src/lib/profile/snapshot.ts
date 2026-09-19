// Batch profile snapshot — the shape returned by batch_profile_snapshot() (0028) and the block
// vocabulary posters compose from. Design record: docs/BATCH-PROFILE-BUILDER.md.

export interface BatchProfileSnapshot {
  generated_at: string;
  batch: { id: string; name: string; starts_on: string | null; ends_on: string | null };
  size: number;
  gender: Record<string, number> | null;
  work_ex: {
    average_months: number | null;
    median_months: number | null;
    buckets: { freshers: number; "1_12": number; "13_24": number; "25_36": number; "37_plus": number };
    sectors: Record<string, number>;
    past_employers: Array<{ name: string; students: number }>;
  };
  education: {
    branches: Record<string, number>;
    premier_institutes: Record<string, number>;
    premier_institutes_total: number;
    specializations: Record<string, number>;
    professional_credentials: Record<string, number>;
  };
  placements: null | {
    placed: number;
    placement_rate: number | null;
    ctc_highest: number | null;
    ctc_average: number | null;
    ctc_median: number | null;
    ctc_top_decile_average: number | null;
    recruiters: number;
    new_recruiters: number;
    sectors: Record<string, number>;
    top_recruiters: Array<{ name: string; offers: number; logo_path: string | null }>;
  };
  baseline: null | { batch_id: string; placed: number; ctc_average: number | null; ctc_median: number | null; recruiters: number };
  institute: {
    name: string;
    tagline: string | null;
    brand: { primary?: string; accent?: string; font?: string; logo_url?: string; photo_url?: string };
    facts: {
      accreditations?: string[];
      rankings?: Array<{ body: string; rank: number | string; as_of?: string }>;
      legacy_since?: number;
      clubs_count?: number;
      international_partners?: number;
      testimonials?: Array<{ quote: string; name: string; title?: string; company?: string }>;
      contact?: { email?: string; phone?: string; website?: string; person?: string };
    };
  };
}

export type PosterAudience = "general" | "finance" | "consulting" | "technology" | "marketing" | "operations";
export type PosterOccasion = "final_placements" | "summer_placements" | "placement_report";
export type PosterFormat = "poster_a4" | "linkedin_landscape" | "linkedin_square" | "story";

export const FORMAT_SIZE: Record<PosterFormat, { w: number; h: number; label: string }> = {
  poster_a4: { w: 1600, h: 1131, label: "A4 landscape poster" },
  linkedin_landscape: { w: 1200, h: 627, label: "LinkedIn / email header" },
  linkedin_square: { w: 1080, h: 1080, label: "LinkedIn square post" },
  story: { w: 1080, h: 1350, label: "Portrait post / story" },
};

// A block is one renderable unit. Templates lay blocks out; composition picks and orders them.
export type BlockId =
  | "batch_size"
  | "gender_split"
  | "work_ex_buckets"
  | "work_ex_average"
  | "work_ex_sectors"
  | "education_branches"
  | "premier_institutes"
  | "credentials"
  | "specializations"
  | "ctc_highlights"
  | "recruiter_counts"
  | "placement_sectors"
  | "past_recruiters"
  | "past_employers"
  | "accreditations"
  | "rankings"
  | "campus_highlights"
  | "testimonials"
  | "season_comparison";

// Which blocks have data in a given snapshot (a block never renders with an invented value).
export function availableBlocks(s: BatchProfileSnapshot): BlockId[] {
  const out: BlockId[] = ["batch_size"];
  if (s.gender && Object.keys(s.gender).length) out.push("gender_split");
  if (s.size > 0) out.push("work_ex_buckets");
  if (s.work_ex.average_months != null) out.push("work_ex_average");
  if (Object.keys(s.work_ex.sectors).length) out.push("work_ex_sectors");
  if (Object.keys(s.education.branches).length) out.push("education_branches");
  if (s.education.premier_institutes_total > 0) out.push("premier_institutes");
  if (Object.keys(s.education.professional_credentials).length) out.push("credentials");
  if (Object.keys(s.education.specializations).length > 1) out.push("specializations");
  if (s.placements?.ctc_median != null || s.placements?.ctc_highest != null) out.push("ctc_highlights");
  if (s.placements && s.placements.recruiters > 0) out.push("recruiter_counts");
  if (s.placements && Object.keys(s.placements.sectors).length) out.push("placement_sectors");
  if (s.placements && s.placements.top_recruiters.length) out.push("past_recruiters");
  if (s.work_ex.past_employers.length) out.push("past_employers");
  if (s.institute.facts.accreditations?.length) out.push("accreditations");
  if (s.institute.facts.rankings?.length) out.push("rankings");
  if (s.institute.facts.clubs_count || s.institute.facts.international_partners) out.push("campus_highlights");
  if (s.institute.facts.testimonials?.length) out.push("testimonials");
  if (s.baseline && s.placements) out.push("season_comparison");
  return out;
}

// ── formatting ─────────────────────────────────────────────────────────────────────────────

export function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

// final_ctc is stored in LPA (the Reports page and export treat it that way). A value that looks
// like rupees (≥ 1000) is converted so a mis-entered roster still renders sensibly.
export function lpa(value: number | null | undefined): string {
  if (value == null) return "—";
  const l = value >= 1000 ? value / 100_000 : value; // tolerate already-in-lakhs seeds
  return `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)} LPA`;
}

export function months(value: number | null | undefined): string {
  return value == null ? "—" : `${value} months`;
}

export function topEntries(record: Record<string, number>, n = 5): Array<[string, number]> {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}
