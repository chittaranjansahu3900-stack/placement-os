import type { OpsIconName } from "@/components/shared/ops-icon";
import type { CvDocument, CvReviewComment } from "@/types/domain";

export type CvVersionRow = CvDocument & { company_type_personas: { category_name: string } | null };
export type UpcomingJd = {
  id: string;
  role_title: string;
  apply_by_deadline: string;
  companies: { name: string } | null;
};

export type ReviewCommentWithAuthor = CvReviewComment & { users?: { name: string } | null };

export function urgency(deadline: string) {
  const hours = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 3_600_000));
  if (hours < 24) return { label: `${hours}h left`, className: "text-red-300 border-red-800 bg-red-950/80" };
  const days = Math.ceil(hours / 24);
  if (days <= 3) return { label: `${days}d left`, className: "text-amber-300 border-amber-800 bg-amber-950/80" };
  return { label: `${days}d left`, className: "text-slate-300 border-slate-700 bg-slate-900" };
}

export function moveArrayItem<T>(array: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= array.length) return array;
  const copy = [...array];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export const inputClass =
  "w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2.5 py-1.5 text-[13px] text-slate-200 outline-none transition-colors focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]";
export const labelClass = "block text-[11px] font-medium uppercase tracking-[0.05em] text-slate-500";
export const addButtonClass =
  "shrink-0 rounded-lg border border-dashed border-[#334155] px-2.5 py-1 text-xs text-[#64748b] transition-colors hover:border-[#4f46e5] hover:text-[#94a3b8]";
export const cardClass = "rounded-lg border border-[#334155] bg-[#0f172a] p-4 shadow-sm";
export const entryCardClass =
  "group mb-2 overflow-hidden rounded-lg border border-[#334155] bg-[#1e293b] open:border-l-[3px] open:border-l-[#6366f1] open:shadow-[0_6px_20px_rgba(0,0,0,0.3)]";

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export const BULLET_MAX = 220;

// Wraps the current selection in a bullet <input> with markdown-lite markers
// — shared syntax with renderFormattedText() in resume-preview.tsx.
export function wrapSelection(input: HTMLInputElement, value: string, marker: string) {
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || "text";
  const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
  return { next, selStart: start + marker.length, selEnd: start + marker.length + selected.length };
}

// Matches src/lib/resume.ts's DEFAULT_SECTION_ORDER plus the two fixed
// (never hideable/reorderable) sections — mirrors Cursivo's own rail exactly.
export const RAIL_SECTIONS: { key: string; label: string; icon: OpsIconName; toggleable: boolean }[] = [
  { key: "personal", label: "Personal & Contact", icon: "user", toggleable: false },
  { key: "academics", label: "Academic Records", icon: "graduation-cap", toggleable: false },
  { key: "skills", label: "Skills", icon: "zap", toggleable: true },
  { key: "experience", label: "Experience", icon: "briefcase", toggleable: true },
  { key: "positions", label: "Positions", icon: "star", toggleable: true },
  { key: "projects", label: "Projects", icon: "layers", toggleable: true },
  { key: "languages", label: "Languages", icon: "globe", toggleable: true },
  { key: "certifications", label: "Certifications", icon: "check-shield", toggleable: true },
  { key: "awards", label: "Awards", icon: "award", toggleable: true },
  { key: "activities", label: "Activities", icon: "activity", toggleable: true },
  { key: "hobbies", label: "Hobbies", icon: "heart", toggleable: true },
  { key: "publications", label: "Publications", icon: "book-open", toggleable: true },
  { key: "customSections", label: "Custom Sections", icon: "grid", toggleable: true },
];
