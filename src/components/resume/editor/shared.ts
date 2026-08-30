import type { OpsIconName } from "@/components/shared/ops-icon";
import type { CvContent, CvDocument, CvReviewComment } from "@/types/domain";

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
  if (hours < 24) return { label: `${hours}h left`, className: "text-red-700 border-red-200 bg-red-50" };
  const days = Math.ceil(hours / 24);
  if (days <= 3) return { label: `${days}d left`, className: "text-amber-700 border-amber-200 bg-amber-50" };
  return { label: `${days}d left`, className: "text-slate-500 border-slate-200 bg-slate-50" };
}

export function moveArrayItem<T>(array: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= array.length) return array;
  const copy = [...array];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#4f46e5] focus:ring-1 focus:ring-[#4f46e5]";
export const labelClass = "block text-[11px] font-medium uppercase tracking-[0.05em] text-slate-500";
export const addButtonClass =
  "shrink-0 rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500 transition-colors hover:border-[#4f46e5] hover:text-[#4f46e5]";
export const cardClass = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
export const entryCardClass =
  "group mb-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 open:border-l-[3px] open:border-l-[#6366f1] open:shadow-[0_6px_20px_rgba(15,23,42,0.08)]";

// Cursivo-matching chrome primitives (CVEditorStyles.jsx) — topbar/rail/pill/palette classes.
export const topbarBtnClass =
  "topbar-btn flex items-center gap-1.5 rounded-full border border-slate-900/[0.08] bg-slate-900/[0.03] px-3 py-1.5 text-xs font-medium text-slate-600 transition-all";
export const topbarBtnPrimaryClass =
  "topbar-btn-primary flex items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(79,70,229,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] transition-transform";
export const tplPillClass =
  "tpl-pill flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-3 py-1.5 text-xs font-medium text-slate-600 transition-all";
export const tplPillActiveClass =
  "tpl-pill flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#4f46e5] bg-[#4f46e5] px-3 py-1.5 text-xs font-medium text-white transition-all";
export const zoomBtnClass =
  "zoom-btn flex size-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:text-slate-700";
export const navRailBtnClass =
  "nav-rail-btn relative flex size-[38px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-600";
export const navRailBtnActiveClass =
  "nav-rail-btn active relative flex size-[38px] items-center justify-center rounded-lg bg-[rgba(79,70,229,0.1)] text-[#4f46e5] transition-colors";
export const cmdItemClass =
  "cmd-item flex items-center gap-3 rounded-[9px] border border-transparent px-3 py-2.5 text-[13.5px] text-slate-500 transition-all";

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Whether a rail section currently has any user-entered content — drives the
// icon rail's filled/empty status dot (Cursivo's nav-rail convention).
export function isSectionFilled(content: CvContent, key: string): boolean {
  switch (key) {
    case "personal":
      return Boolean(content.personalInfo.name.trim() || content.personalInfo.email.trim());
    case "academics":
      return content.academics.length > 0;
    case "skills":
      return content.skills.length > 0;
    case "experience":
      return content.experience.length > 0;
    case "positions":
      return content.positions.length > 0;
    case "projects":
      return content.projects.length > 0;
    case "languages":
      return content.languages.length > 0;
    case "certifications":
      return content.certifications.length > 0;
    case "awards":
      return content.awards.length > 0;
    case "activities":
      return content.activities.length > 0;
    case "hobbies":
      return content.hobbies.length > 0;
    case "publications":
      return content.publications.length > 0;
    case "customSections":
      return content.customSections.length > 0;
    default:
      return false;
  }
}

export const BULLET_MAX = 220;

// Wraps the current selection in a bullet <textarea> with markdown-lite markers
// — shared syntax with renderFormattedText() in resume-preview.tsx.
export function wrapSelection(input: HTMLInputElement | HTMLTextAreaElement, value: string, marker: string) {
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
