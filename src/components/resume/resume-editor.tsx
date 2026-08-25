"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  saveCvDocument,
  updateCvReviewCommentStatus,
  cloneCvVersion,
  createCvDocument,
  scoreCvForJd,
  setLatestCvDocument,
} from "@/app/actions/resume";
import { uploadCvFile } from "@/app/actions/files";
import { ResumeExportButtons } from "@/components/resume/resume-export-buttons";
import { ResumeAiAssistant } from "@/components/resume/resume-ai-assistant";
import { ResumePreview, resumeFieldKey, type ResumeFieldSpec } from "@/components/shared/resume-preview";
import { TopbarDropdown } from "@/components/resume/topbar-dropdown";
import { normalizeCvContent } from "@/lib/resume";
import { CV_TEMPLATES, normalizeCvTemplateId } from "@/lib/resume-templates";
import { OpsIcon, type OpsIconName } from "@/components/shared/ops-icon";
import type {
  CompanyTypePersona,
  CvAcademicEntry,
  CvBullet,
  CvContent,
  CvCustomSection,
  CvDocument,
  CvExperienceEntry,
  CvLanguageEntry,
  CvProjectEntry,
  CvPublicationEntry,
  CvReviewComment,
} from "@/types/domain";

type CvVersionRow = CvDocument & { company_type_personas: { category_name: string } | null };
type UpcomingJd = {
  id: string;
  role_title: string;
  apply_by_deadline: string;
  companies: { name: string } | null;
};

function urgency(deadline: string) {
  const hours = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 3_600_000));
  if (hours < 24) return { label: `${hours}h left`, className: "text-red-300 border-red-800 bg-red-950/80" };
  const days = Math.ceil(hours / 24);
  if (days <= 3) return { label: `${days}d left`, className: "text-amber-300 border-amber-800 bg-amber-950/80" };
  return { label: `${days}d left`, className: "text-slate-300 border-slate-700 bg-slate-900" };
}

function moveArrayItem<T>(array: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= array.length) return array;
  const copy = [...array];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

const inputClass =
  "w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2.5 py-1.5 text-[13px] text-slate-200 outline-none transition-colors focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]";
const labelClass = "block text-[11px] font-medium uppercase tracking-[0.05em] text-slate-500";
const addButtonClass =
  "shrink-0 rounded-lg border border-dashed border-[#334155] px-2.5 py-1 text-xs text-[#64748b] transition-colors hover:border-[#4f46e5] hover:text-[#94a3b8]";
const cardClass = "rounded-lg border border-[#334155] bg-[#0f172a] p-4 shadow-sm";
const entryCardClass =
  "group mb-2 overflow-hidden rounded-lg border border-[#334155] bg-[#1e293b] open:border-l-[3px] open:border-l-[#6366f1] open:shadow-[0_6px_20px_rgba(0,0,0,0.3)]";

type ReviewCommentWithAuthor = CvReviewComment & { users?: { name: string } | null };

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const BULLET_MAX = 220;

// Wraps the current selection in a bullet <input> with markdown-lite markers
// — shared syntax with renderFormattedText() in resume-preview.tsx.
function wrapSelection(input: HTMLInputElement, value: string, marker: string) {
  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? value.length;
  const selected = value.slice(start, end) || "text";
  const next = value.slice(0, start) + marker + selected + marker + value.slice(end);
  return { next, selStart: start + marker.length, selEnd: start + marker.length + selected.length };
}

function BulletRow({
  bullet, onChange, onRemove, dataField, documentId,
}: {
  bullet: CvBullet;
  onChange: (text: string) => void;
  onRemove: () => void;
  dataField?: string;
  documentId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [improving, setImproving] = useState(false);

  function applyMarker(marker: string) {
    const input = inputRef.current;
    if (!input) return;
    const { next, selStart, selEnd } = wrapSelection(input, bullet.text, marker);
    onChange(next.slice(0, BULLET_MAX));
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(selStart, selEnd);
    });
  }

  async function improve() {
    if (!bullet.text.trim() || improving) return;
    setImproving(true);
    try {
      const response = await fetch("/api/resume/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "writing_assist", input: bullet.text, cvDocumentId: documentId }),
      });
      const payload = (await response.json()) as { output?: string };
      if (response.ok && payload.output) onChange(payload.output.slice(0, BULLET_MAX));
    } catch {
      // Best-effort — matches this app's existing silent-AI-failure convention.
    } finally {
      setImproving(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#334155] bg-[#0f172a] p-2">
      <input
        ref={inputRef}
        data-field={dataField}
        value={bullet.text}
        onChange={(e) => onChange(e.target.value.slice(0, BULLET_MAX))}
        maxLength={BULLET_MAX}
        className={`${inputClass} mb-1.5`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("**")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] font-bold text-slate-300 hover:border-slate-600">
            B
          </button>
          <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("_")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] italic text-slate-300 hover:border-slate-600">
            I
          </button>
          <button type="button" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("++")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] underline text-slate-300 hover:border-slate-600">
            U
          </button>
          <button type="button" title="Strikethrough" onMouseDown={(e) => e.preventDefault()} onClick={() => applyMarker("~~")} className="flex size-6 items-center justify-center rounded border border-[#334155] text-[11px] line-through text-slate-300 hover:border-slate-600">
            S
          </button>
          <button
            type="button"
            onClick={improve}
            disabled={improving || !bullet.text.trim()}
            className="ml-1 flex items-center gap-1 rounded-full border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-900/40 disabled:opacity-40"
          >
            <OpsIcon name="sparkles" size={10} />
            {improving ? "Improving…" : "Improve"}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">{bullet.text.length}/{BULLET_MAX}</span>
          <button type="button" onClick={onRemove} className="text-[#ef4444] hover:text-red-300">
            <OpsIcon name="x" size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BulletEditor({
  bullets, onChange, dataFieldBase, documentId,
}: {
  bullets: CvBullet[];
  onChange: (bullets: CvBullet[]) => void;
  dataFieldBase?: string;
  documentId: string;
}) {
  return (
    <div className="space-y-2">
      {bullets.map((bullet, index) => (
        <BulletRow
          key={bullet.id}
          bullet={bullet}
          documentId={documentId}
          dataField={index === 0 ? dataFieldBase : undefined}
          onChange={(text) => onChange(bullets.map((b, i) => (i === index ? { ...b, text } : b)))}
          onRemove={() => onChange(bullets.filter((_, i) => i !== index))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...bullets, { id: newId("bullet"), text: "" }])}
        className={addButtonClass}
      >
        + Add bullet
      </button>
    </div>
  );
}

// Matches src/lib/resume.ts's DEFAULT_SECTION_ORDER plus the two fixed
// (never hideable/reorderable) sections — mirrors Cursivo's own rail exactly.
const RAIL_SECTIONS: { key: string; label: string; icon: OpsIconName; toggleable: boolean }[] = [
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

function EntryHeader({
  title, onRemove, onMoveUp, onMoveDown,
}: {
  title: string;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium text-slate-200 hover:text-white">
      <span className="min-w-0 truncate">{title}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {onMoveUp && (
          <button
            type="button"
            title="Move up"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMoveUp(); }}
            className="text-slate-500 hover:text-slate-300"
          >
            <OpsIcon name="chevron-up" size={12} />
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            title="Move down"
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onMoveDown(); }}
            className="text-slate-500 hover:text-slate-300"
          >
            <OpsIcon name="chevron-down" size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="font-mono text-xs text-[#ef4444] hover:text-red-300"
        >
          Remove
        </button>
        <OpsIcon
          name="chevron-down"
          size={14}
          className="text-slate-500 transition-transform group-open:rotate-180"
        />
      </span>
    </summary>
  );
}

function SectionHeader({
  title, sectionKey, hiddenSections, onToggleHidden, onAdd, addLabel,
}: {
  title: string;
  sectionKey?: string;
  hiddenSections?: string[];
  onToggleHidden?: (key: string) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const isHidden = sectionKey ? (hiddenSections ?? []).includes(sectionKey) : false;
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">{title}</h2>
        {sectionKey && onToggleHidden && (
          <button
            type="button"
            onClick={() => onToggleHidden(sectionKey)}
            title={isHidden ? "Hidden from CV — click to show" : "Shown on CV — click to hide"}
            className={isHidden ? "text-slate-600 hover:text-slate-400" : "text-emerald-500 hover:text-emerald-400"}
          >
            <OpsIcon name={isHidden ? "eye-off" : "eye"} size={13} />
          </button>
        )}
      </div>
      {onAdd && addLabel && (
        <button type="button" onClick={onAdd} className={addButtonClass}>{addLabel}</button>
      )}
    </div>
  );
}

function StringListEditor({
  items, onChange, placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={item}
            onChange={(event) => onChange(items.map((value, i) => (i === index ? event.target.value : value)))}
            placeholder={placeholder}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="shrink-0 text-[#ef4444] hover:text-red-300"
          >
            <OpsIcon name="x" size={14} />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ""])} className={addButtonClass}>
        + Add
      </button>
    </div>
  );
}

export function ResumeEditor({
  documentId,
  initialContent,
  initialTemplateId,
  comments,
  versions,
  personas,
  upcomingJds,
}: {
  documentId: string;
  initialContent: CvContent;
  initialTemplateId: string;
  comments: ReviewCommentWithAuthor[];
  versions: CvVersionRow[];
  personas: CompanyTypePersona[];
  upcomingJds: UpcomingJd[];
}) {
  const [content, setContent] = useState(() => normalizeCvContent(initialContent));
  const [templateId, setTemplateId] = useState(() => normalizeCvTemplateId(initialTemplateId));
  const [builder, setBuilder] = useState({ action: "", outcome: "", metric: "" });
  const [skillInput, setSkillInput] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [zoom, setZoom] = useState(100);

  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const detailsRefs = useRef(new Map<string, HTMLDetailsElement>());
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  function scrollToSection(key: string) {
    sectionRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleFieldClick(spec: ResumeFieldSpec) {
    if (spec.entryId) {
      const details = detailsRefs.current.get(spec.entryId);
      if (details && !details.open) details.open = true;
    }
    const key = resumeFieldKey(spec);
    const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  function toggleSectionHidden(key: string) {
    setContent((current) => ({
      ...current,
      hiddenSections: current.hiddenSections.includes(key)
        ? current.hiddenSections.filter((k) => k !== key)
        : [...current.hiddenSections, key],
    }));
  }

  function expandAll() {
    detailsRefs.current.forEach((el) => { el.open = true; });
  }
  function collapseAll() {
    detailsRefs.current.forEach((el) => { el.open = false; });
  }

  function fitZoom() {
    const width = canvasWrapperRef.current?.clientWidth;
    if (!width) return;
    setZoom(Math.max(40, Math.min(150, Math.round(((width - 48) / 794) * 100))));
  }
  useEffect(() => {
    fitZoom();
  }, []);

  function updatePersonal(field: keyof CvContent["personalInfo"], value: string) {
    setContent((current) => ({
      ...current,
      personalInfo: { ...current.personalInfo, [field]: value },
    }));
  }

  function updateAcademic(index: number, patch: Partial<CvAcademicEntry>) {
    setContent((current) => ({
      ...current,
      academics: current.academics.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateExperience(
    section: "experience" | "positions",
    index: number,
    patch: Partial<CvExperienceEntry>,
  ) {
    setContent((current) => ({
      ...current,
      [section]: current[section].map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateProject(index: number, patch: Partial<CvProjectEntry>) {
    setContent((current) => ({
      ...current,
      projects: current.projects.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  }

  function updateLanguage(index: number, patch: Partial<CvLanguageEntry>) {
    setContent((current) => ({
      ...current,
      languages: current.languages.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function updatePublication(index: number, patch: Partial<CvPublicationEntry>) {
    setContent((current) => ({
      ...current,
      publications: current.publications.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function updateCustomSection(index: number, patch: Partial<CvCustomSection>) {
    setContent((current) => ({
      ...current,
      customSections: current.customSections.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function addSkill() {
    const value = skillInput.trim();
    if (!value || content.skills.includes(value)) {
      setSkillInput("");
      return;
    }
    setContent((current) => ({ ...current, skills: [...current.skills, value] }));
    setSkillInput("");
  }
  function removeSkill(skill: string) {
    setContent((current) => ({ ...current, skills: current.skills.filter((s) => s !== skill) }));
  }

  function addAchievement() {
    const parts = [builder.action.trim(), builder.outcome.trim(), builder.metric.trim()].filter(Boolean);
    if (!parts.length) return;
    const bulletText = parts.join("; ");
    setContent((current) => ({
      ...current,
      experience: current.experience.length
        ? current.experience.map((entry, index) =>
            index === 0
              ? {
                  ...entry,
                  bullets: [...entry.bullets, { id: newId("ach"), text: bulletText }],
                }
              : entry,
          )
        : [
            {
              id: newId("exp"),
              company: "Highlighted Achievements",
              role: "Student",
              period: "",
              bullets: [{ id: newId("ach"), text: bulletText }],
            },
          ],
    }));
    setBuilder({ action: "", outcome: "", metric: "" });
  }

  const currentVersion = versions.find((v) => v.id === documentId);
  const nearestDeadline = upcomingJds[0] ? urgency(upcomingJds[0].apply_by_deadline) : null;

  const pillTriggerClass = (open: boolean, activeTone = "border-[#334155] text-slate-300 hover:border-slate-600") =>
    `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${open ? "border-[#4f46e5] bg-[#1e293b] text-white" : `bg-[#1e293b] ${activeTone}`}`;

  return (
    <div className="space-y-4">
      {/* Unified Topbar — Row 1: identity+switcher / tool pills / export. Row 2: template gallery / zoom. */}
      <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#0f172a] p-3 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="hidden items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400 sm:flex">
            <OpsIcon name="file-text" size={12} />
            <span>Placement CV Studio</span>
          </div>

          {/* CV Switcher */}
          <TopbarDropdown
            panelClassName="w-72 p-3"
            trigger={(open) => (
              <span
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium text-white transition-colors ${open ? "border-[#6366f1] bg-[#1e293b]" : "border-[#334155] bg-[#1e293b] hover:border-[#4f46e5]"}`}
              >
                <span className="max-w-40 truncate">{content.title || "My CV"}</span>
                {currentVersion && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                    v{currentVersion.version_no}
                  </span>
                )}
                <OpsIcon name="chevron-down" size={12} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
              </span>
            )}
          >
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              My CV Versions ({versions.length})
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto">
              {versions.map((v) => (
                <Link
                  key={v.id}
                  href={`/resume?cv=${v.id}`}
                  className={`block rounded-md border p-2.5 text-xs transition-colors ${
                    v.id === documentId
                      ? "border-amber-700/80 bg-amber-950/40 text-amber-200"
                      : "border-[#334155] bg-[#1e293b] text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-white">{normalizeCvContent(v.content).title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-amber-400">v{v.version_no}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] text-slate-500">
                    <span>{v.company_type_personas?.category_name ?? "General"}</span>
                    {v.is_latest && (
                      <span className="rounded border border-emerald-700/80 bg-emerald-950 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                        PRIMARY
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-[#334155] pt-3">
              <form action={cloneCvVersion} className="flex-1">
                <input type="hidden" name="cv_document_id" value={documentId} />
                <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#334155] px-2 py-1.5 text-[11px] text-slate-300 hover:border-slate-600">
                  <OpsIcon name="copy" size={11} />
                  <span>Clone</span>
                </button>
              </form>
              {currentVersion && !currentVersion.is_latest && (
                <form action={setLatestCvDocument} className="flex-1">
                  <input type="hidden" name="cv_document_id" value={documentId} />
                  <button className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-700/70 bg-emerald-950/40 px-2 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-900/40">
                    <OpsIcon name="check" size={11} />
                    <span>Set Primary</span>
                  </button>
                </form>
              )}
            </div>

            <form action={createCvDocument} className="mt-3 space-y-2 border-t border-[#334155] pt-3">
              <select name="persona_id" className="w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-xs text-white">
                <option value="">General Placement CV</option>
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>{persona.category_name}</option>
                ))}
              </select>
              <button className="w-full rounded-lg border border-dashed border-[#334155] px-2 py-1.5 text-xs text-[#94a3b8] hover:border-[#4f46e5]">
                + Create Pre-filled CV
              </button>
            </form>
          </TopbarDropdown>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Upload */}
          <TopbarDropdown
            align="right"
            panelClassName="w-72 space-y-2.5 p-3.5"
            trigger={(open) => (
              <span className={pillTriggerClass(open)}>
                <OpsIcon name="upload" size={13} />
                <span>Upload</span>
              </span>
            )}
          >
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              <OpsIcon name="upload" size={13} className="text-blue-400" />
              <span>Original CV File</span>
            </h2>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Stored and downloaded in full without contact-detail redaction or shortlist gating.
            </p>
            {currentVersion?.file_url && (
              <a
                href={`/api/files/download?path=${encodeURIComponent(currentVersion.file_url)}&name=${encodeURIComponent(`${content.title}.pdf`)}`}
                className="inline-flex items-center gap-1.5 font-mono text-xs text-blue-400 hover:text-blue-300"
              >
                <OpsIcon name="download" size={12} />
                Download uploaded file
              </a>
            )}
            <form action={uploadCvFile} className="space-y-2">
              <input type="hidden" name="cv_document_id" value={documentId} />
              <input
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.txt"
                required
                className={`${inputClass} file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-xs file:text-slate-200`}
              />
              <button className="w-full rounded-lg border border-[#334155] px-2 py-1.5 text-xs text-slate-300 hover:border-slate-600">
                Upload or Replace File
              </button>
            </form>
          </TopbarDropdown>

          {/* JD Keyword Fit */}
          {upcomingJds.length > 0 && (
            <TopbarDropdown
              align="right"
              panelClassName="w-80 space-y-2.5 p-3.5"
              trigger={(open) => (
                <span className={pillTriggerClass(open)}>
                  <OpsIcon name="sparkles" size={13} />
                  <span>JD Fit{content.jdFit ? ` · ${content.jdFit.score}%` : ""}</span>
                </span>
              )}
            >
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">JD Keyword Fit Score</h2>
              {content.jdFit && (
                <div className="space-y-2 rounded-md border border-blue-900/60 bg-blue-950/30 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-2xl font-bold text-blue-200">{content.jdFit.score}%</span>
                    <span className="font-mono text-[10px] font-bold uppercase text-blue-400">ATS Match</span>
                  </div>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {Object.entries(content.jdFit.sectionCoverage).map(([section, score]) => (
                      <div key={section} className="space-y-0.5">
                        <div className="flex justify-between text-slate-400">
                          <span className="capitalize">{section}</span>
                          <span>{score}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {content.jdFit.missingKeywords.length > 0 && (
                    <p className="border-t border-blue-900/40 pt-2 font-mono text-[11px] text-amber-300">
                      Missing: {content.jdFit.missingKeywords.join(", ")}
                    </p>
                  )}
                </div>
              )}
              <form action={scoreCvForJd} className="space-y-2">
                <input type="hidden" name="cv_document_id" value={documentId} />
                <select name="jd_id" required className="w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-xs text-white">
                  <option value="">Select Target JD...</option>
                  {upcomingJds.map((jd) => (
                    <option key={jd.id} value={jd.id}>{jd.companies?.name} — {jd.role_title}</option>
                  ))}
                </select>
                <textarea
                  name="job_description"
                  placeholder="Paste JD requirements to calculate section match..."
                  className={`${inputClass} min-h-20`}
                />
                <button className="w-full rounded-lg border border-[#334155] px-2 py-1.5 text-xs text-slate-300 hover:border-slate-600">
                  Calculate ATS Fit
                </button>
              </form>
            </TopbarDropdown>
          )}

          {/* Deadlines */}
          <TopbarDropdown
            align="right"
            panelClassName="w-72 space-y-2.5 p-3.5"
            trigger={(open) => (
              <span className={pillTriggerClass(open)}>
                <OpsIcon name="clock" size={13} />
                <span>Deadlines</span>
                {nearestDeadline && <span className="size-1.5 rounded-full bg-amber-400" />}
              </span>
            )}
          >
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Application Deadlines</h2>
            <div className="space-y-2">
              {upcomingJds.map((jd) => {
                const itemUrgency = urgency(jd.apply_by_deadline);
                return (
                  <div key={jd.id} className="rounded-md border border-[#334155] bg-[#1e293b] p-2.5">
                    <p className="text-xs font-bold text-white">{jd.companies?.name ?? "Company"}</p>
                    <p className="truncate text-[11px] text-slate-400">{jd.role_title}</p>
                    <span className={`mt-1.5 inline-block rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${itemUrgency.className}`}>
                      {itemUrgency.label}
                    </span>
                  </div>
                );
              })}
              {upcomingJds.length === 0 && <p className="font-mono text-xs text-slate-400">No active deadlines.</p>}
            </div>
          </TopbarDropdown>

          {/* Review Remarks */}
          {comments.length > 0 && (
            <TopbarDropdown
              align="right"
              panelClassName="w-80 space-y-2.5 p-3.5"
              trigger={(open) => (
                <span className={pillTriggerClass(open, "border-amber-700 text-amber-400 hover:text-amber-300")}>
                  <OpsIcon name="message-square" size={13} />
                  <span>Remarks · {comments.length}</span>
                </span>
              )}
            >
              <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                <OpsIcon name="message-square" size={13} className="text-amber-400" />
                <span>SPC Committee Review Remarks ({comments.length})</span>
              </h2>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="rounded-md border border-[#334155] bg-[#080f21] p-3 text-xs">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase text-slate-400">
                      <span>
                        {comment.anchor_section}
                        {comment.anchor_bullet_id ? ` · ${comment.anchor_bullet_id}` : ""}
                      </span>
                      <span className={comment.status === "applied" ? "font-bold text-emerald-400" : "text-amber-400"}>
                        {comment.status}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-200">{comment.comment_text}</p>
                    <div className="mt-2 flex gap-2">
                      {(["open", "applied", "dismissed"] as const).map((status) => (
                        <form key={status} action={updateCvReviewCommentStatus}>
                          <input type="hidden" name="comment_id" value={comment.id} />
                          <input type="hidden" name="cv_document_id" value={documentId} />
                          <input type="hidden" name="status" value={status} />
                          <button
                            type="submit"
                            disabled={comment.status === status}
                            className="rounded border border-[#334155] bg-[#1e293b] px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                          >
                            Mark {status}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </TopbarDropdown>
          )}

          {/* AI Resume Assistant */}
          <TopbarDropdown
            align="right"
            panelClassName="w-96 p-3.5"
            trigger={(open) => (
              <span className={pillTriggerClass(open, "border-[#4f46e5] text-[#a5b4fc] hover:text-white")}>
                <OpsIcon name="sparkles" size={13} />
                <span>AI Assistant</span>
              </span>
            )}
          >
            <ResumeAiAssistant
              documentId={documentId}
              content={content}
              onApplyBullet={(bullet) => {
                setContent((current) => ({
                  ...current,
                  experience: current.experience.length
                    ? current.experience.map((entry, index) =>
                        index === 0
                          ? {
                              ...entry,
                              bullets: [...entry.bullets, { id: newId("ai"), text: bullet }],
                            }
                          : entry,
                      )
                    : [
                        {
                          id: newId("exp"),
                          company: "Experience",
                          role: "Role",
                          period: "",
                          bullets: [{ id: newId("ai"), text: bullet }],
                        },
                      ],
                }));
              }}
              onApplyImported={(imported) => setContent(imported)}
            />
          </TopbarDropdown>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Full View / Export */}
          <Link
            href={`/resume/${documentId}`}
            title="Full View / Export"
            className="flex size-8 items-center justify-center rounded-lg border border-[#334155] text-slate-400 hover:text-slate-200"
          >
            <OpsIcon name="eye" size={14} />
          </Link>

          <ResumeExportButtons fileName={content.personalInfo.name || content.title} content={content} templateId={templateId} />
          <form action={saveCvDocument}>
            <input type="hidden" name="cv_document_id" value={documentId} />
            <input type="hidden" name="template_id" value={templateId} />
            <input type="hidden" name="content_json" value={JSON.stringify(content)} />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#4338ca] via-[#4f46e5] to-[#6366f1] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.15)] transition-transform hover:-translate-y-px"
            >
              <OpsIcon name="check" size={13} />
              <span>Save CV Document</span>
            </button>
          </form>
        </div>
      </div>

      {/* Row 2 — Template gallery + zoom controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#0f172a] px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1 rounded-full bg-[#1e293b] p-1">
          {CV_TEMPLATES.map((template, i) => {
            const dotColors = ["#6366f1", "#3b82f6", "#f59e0b"];
            const selected = template.id === templateId;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setTemplateId(template.id)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${selected ? "bg-[#6366f1] text-white" : "text-slate-300 hover:bg-[rgba(255,255,255,0.06)]"}`}
              >
                <span className="size-1.5 shrink-0 rounded-full" style={{ background: selected ? "white" : dotColors[i % dotColors.length] }} />
                {template.name}
              </button>
            );
          })}
          <span title="More templates coming soon" className="flex shrink-0 cursor-not-allowed items-center gap-1 whitespace-nowrap px-2.5 py-1.5 text-xs text-slate-600">
            <OpsIcon name="plus" size={11} />
            Browse
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(40, z - 10))}
            className="flex size-7 items-center justify-center rounded-lg border border-[#334155] text-slate-400 hover:text-slate-200"
          >
            <OpsIcon name="minus" size={12} />
          </button>
          <span className="w-12 text-center font-mono text-xs text-slate-400">{zoom}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(150, z + 10))}
            className="flex size-7 items-center justify-center rounded-lg border border-[#334155] text-slate-400 hover:text-slate-200"
          >
            <OpsIcon name="plus" size={12} />
          </button>
          <button
            type="button"
            onClick={fitZoom}
            className="rounded-lg border border-[#334155] px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
          >
            Fit
          </button>
        </div>
      </div>
      </div>

      {/* Editor + Live Canvas */}
      <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#080f21] lg:flex lg:items-stretch">
        {/* Icon rail */}
        <div className="flex shrink-0 flex-row gap-1 border-b border-[#1e293b] bg-[#030507] p-2 lg:w-[46px] lg:flex-col lg:border-b-0 lg:border-r lg:py-4">
          {RAIL_SECTIONS.map((section) => {
            const matchesFilter = !sectionFilter.trim() || section.label.toLowerCase().includes(sectionFilter.trim().toLowerCase());
            const isHidden = section.toggleable && content.hiddenSections.includes(section.key);
            return (
              <button
                key={section.key}
                type="button"
                title={section.label}
                onClick={() => scrollToSection(section.key)}
                className={`relative flex size-[38px] items-center justify-center rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#94a3b8] ${matchesFilter ? "text-[#4e6280]" : "text-[#2a3648] opacity-40"} ${isHidden ? "opacity-40" : ""}`}
              >
                <OpsIcon name={section.icon} size={17} />
              </button>
            );
          })}
        </div>

        {/* Form column */}
        <div className="min-w-0 flex-1 space-y-4 p-4 lg:max-h-[calc(100vh-180px)] lg:max-w-[420px] lg:flex-none lg:overflow-y-auto lg:border-r lg:border-[#1e293b] lg:p-5">
          {/* Search + expand/collapse */}
          <div className="space-y-2">
            <div className="relative">
              <OpsIcon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                placeholder="Search sections…"
                className={`${inputClass} pl-8`}
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <button type="button" onClick={expandAll} className="hover:text-slate-200">Expand all</button>
              <span className="text-slate-700">·</span>
              <button type="button" onClick={collapseAll} className="hover:text-slate-200">Collapse all</button>
            </div>
          </div>

          {/* Personal Details */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("personal", el);
            }}
            className={cardClass}
          >
            <h2 className="mb-3 border-b border-[#1e293b] pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Personal &amp; Contact Header
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Full Candidate Name</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "name" })}
                  value={content.personalInfo.name}
                  onChange={(event) => updatePersonal("name", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Resume Headline</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "headline" })}
                  value={content.personalInfo.headline}
                  onChange={(event) => updatePersonal("headline", event.target.value.slice(0, 80))}
                  placeholder="Senior PM | Fintech · Growth | 0→1 (80 chars max)"
                  maxLength={80}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Phone Number</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "phone" })}
                  value={content.personalInfo.phone}
                  onChange={(event) => updatePersonal("phone", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Institute Email</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "email" })}
                  value={content.personalInfo.email}
                  onChange={(event) => updatePersonal("email", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>LinkedIn</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "linkedin" })}
                  value={content.personalInfo.linkedin}
                  onChange={(event) => updatePersonal("linkedin", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Website / Portfolio</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "website" })}
                  value={content.personalInfo.website}
                  onChange={(event) => updatePersonal("website", event.target.value)}
                  placeholder="github.com/yourname or yourname.dev"
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Location</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "location" })}
                  value={content.personalInfo.location}
                  onChange={(event) => updatePersonal("location", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Total Experience</label>
                <input
                  value={content.personalInfo.totalExperience}
                  onChange={(event) => updatePersonal("totalExperience", event.target.value)}
                  placeholder="e.g. 6 Years"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Date of Birth (optional)</label>
                <input
                  value={content.personalInfo.dateOfBirth}
                  onChange={(event) => updatePersonal("dateOfBirth", event.target.value)}
                  placeholder="e.g. 15 Aug 1995"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Gender (optional)</label>
                <input
                  value={content.personalInfo.gender}
                  onChange={(event) => updatePersonal("gender", event.target.value)}
                  placeholder="e.g. Male / Female"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass}>Executive Summary (optional)</label>
              <textarea
                data-field={resumeFieldKey({ section: "personal", field: "summary" })}
                value={content.personalInfo.summary}
                onChange={(event) => updatePersonal("summary", event.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>
          </section>

          {/* Academic Records */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("academics", el);
            }}
          >
            <SectionHeader
              title="Academic Record Entries"
              onAdd={() =>
                setContent((c) => ({
                  ...c,
                  academics: [
                    ...c.academics,
                    { id: newId("acad"), course: "", institute: "", year: "", result: "" },
                  ],
                }))
              }
              addLabel="+ Add Row"
            />
            {content.academics.map((row, index) => (
              <details
                key={row.id}
                ref={(el) => {
                  if (el) detailsRefs.current.set(row.id, el);
                  else detailsRefs.current.delete(row.id);
                }}
                className={entryCardClass}
              >
                <EntryHeader
                  title={row.institute || row.course || `Record #${index + 1}`}
                  onRemove={() =>
                    setContent((c) => ({
                      ...c,
                      academics: c.academics.filter((_, i) => i !== index),
                    }))
                  }
                />
                <div className="grid gap-3 border-t border-[#334155] p-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Degree / Course</label>
                    <input
                      data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "course" })}
                      value={row.course}
                      onChange={(e) => updateAcademic(index, { course: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Institute</label>
                    <input
                      data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "institute" })}
                      value={row.institute}
                      onChange={(e) => updateAcademic(index, { institute: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Year</label>
                    <input
                      data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "year" })}
                      value={row.year}
                      onChange={(e) => updateAcademic(index, { year: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Score / CGPA</label>
                    <input
                      data-field={resumeFieldKey({ section: "academics", entryId: row.id, field: "result" })}
                      value={row.result}
                      onChange={(e) => updateAcademic(index, { result: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                </div>
              </details>
            ))}
          </section>

          {/* Skills */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("skills", el);
            }}
          >
            <SectionHeader title="Skills" sectionKey="skills" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <div className={cardClass}>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {content.skills.map((skill) => (
                  <span key={skill} className="flex items-center gap-1 rounded-full border border-[#334155] bg-[#1e293b] px-2.5 py-1 text-xs text-slate-200">
                    {skill}
                    <button type="button" onClick={() => removeSkill(skill)} className="text-slate-500 hover:text-red-400">
                      <OpsIcon name="x" size={10} />
                    </button>
                  </span>
                ))}
                {content.skills.length === 0 && <p className="text-xs text-slate-500">No skills added yet.</p>}
              </div>
              <div className="flex gap-2">
                <input
                  data-field={resumeFieldKey({ section: "skills", field: "skills" })}
                  value={skillInput}
                  onChange={(event) => setSkillInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addSkill(); } }}
                  placeholder="Type a skill and press Enter"
                  className={inputClass}
                />
                <button type="button" onClick={addSkill} className={addButtonClass}>Add</button>
              </div>
            </div>
          </section>

          {/* Experience & Internships */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("experience", el);
            }}
          >
            <SectionHeader
              title="Internships & Professional Experience"
              sectionKey="experience"
              hiddenSections={content.hiddenSections}
              onToggleHidden={toggleSectionHidden}
              onAdd={() =>
                setContent((c) => ({
                  ...c,
                  experience: [
                    ...c.experience,
                    { id: newId("exp"), company: "", role: "", period: "", bullets: [] },
                  ],
                }))
              }
              addLabel="+ Add Experience"
            />
            {content.experience.map((entry, index) => (
              <details
                key={entry.id}
                ref={(el) => {
                  if (el) detailsRefs.current.set(entry.id, el);
                  else detailsRefs.current.delete(entry.id);
                }}
                className={entryCardClass}
              >
                <EntryHeader
                  title={entry.company || `Experience #${index + 1}`}
                  onMoveUp={index > 0 ? () => setContent((c) => ({ ...c, experience: moveArrayItem(c.experience, index, -1) })) : undefined}
                  onMoveDown={index < content.experience.length - 1 ? () => setContent((c) => ({ ...c, experience: moveArrayItem(c.experience, index, 1) })) : undefined}
                  onRemove={() =>
                    setContent((c) => ({
                      ...c,
                      experience: c.experience.filter((_, i) => i !== index),
                    }))
                  }
                />
                <div className="space-y-3 border-t border-[#334155] p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>Company / Organization</label>
                      <input
                        data-field={resumeFieldKey({ section: "experience", entryId: entry.id, field: "company" })}
                        value={entry.company}
                        onChange={(e) => updateExperience("experience", index, { company: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Designation / Role</label>
                      <input
                        value={entry.role}
                        onChange={(e) => updateExperience("experience", index, { role: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Duration / Period</label>
                      <input
                        data-field={resumeFieldKey({ section: "experience", entryId: entry.id, field: "period" })}
                        value={entry.period}
                        onChange={(e) => updateExperience("experience", index, { period: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Achievement Bullets</label>
                    <BulletEditor
                      bullets={entry.bullets}
                      documentId={documentId}
                      dataFieldBase={resumeFieldKey({ section: "experience", entryId: entry.id, field: "bullets" })}
                      onChange={(bullets) => updateExperience("experience", index, { bullets })}
                    />
                  </div>
                </div>
              </details>
            ))}
          </section>

          {/* Positions of Responsibility */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("positions", el);
            }}
          >
            <SectionHeader
              title="Positions of Responsibility"
              sectionKey="positions"
              hiddenSections={content.hiddenSections}
              onToggleHidden={toggleSectionHidden}
              onAdd={() =>
                setContent((c) => ({
                  ...c,
                  positions: [
                    ...c.positions,
                    { id: newId("pos"), company: "", role: "", period: "", bullets: [] },
                  ],
                }))
              }
              addLabel="+ Add Position"
            />
            {content.positions.map((entry, index) => (
              <details
                key={entry.id}
                ref={(el) => {
                  if (el) detailsRefs.current.set(entry.id, el);
                  else detailsRefs.current.delete(entry.id);
                }}
                className={entryCardClass}
              >
                <EntryHeader
                  title={entry.role || `Position #${index + 1}`}
                  onMoveUp={index > 0 ? () => setContent((c) => ({ ...c, positions: moveArrayItem(c.positions, index, -1) })) : undefined}
                  onMoveDown={index < content.positions.length - 1 ? () => setContent((c) => ({ ...c, positions: moveArrayItem(c.positions, index, 1) })) : undefined}
                  onRemove={() =>
                    setContent((c) => ({
                      ...c,
                      positions: c.positions.filter((_, i) => i !== index),
                    }))
                  }
                />
                <div className="space-y-3 border-t border-[#334155] p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>Organization / Club</label>
                      <input
                        data-field={resumeFieldKey({ section: "positions", entryId: entry.id, field: "company" })}
                        value={entry.company}
                        onChange={(e) => updateExperience("positions", index, { company: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Position / Role</label>
                      <input
                        value={entry.role}
                        onChange={(e) => updateExperience("positions", index, { role: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Duration / Period</label>
                      <input
                        data-field={resumeFieldKey({ section: "positions", entryId: entry.id, field: "period" })}
                        value={entry.period}
                        onChange={(e) => updateExperience("positions", index, { period: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Bullets</label>
                    <BulletEditor
                      bullets={entry.bullets}
                      documentId={documentId}
                      dataFieldBase={resumeFieldKey({ section: "positions", entryId: entry.id, field: "bullets" })}
                      onChange={(bullets) => updateExperience("positions", index, { bullets })}
                    />
                  </div>
                </div>
              </details>
            ))}
          </section>

          {/* Academic & Live Projects */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("projects", el);
            }}
          >
            <SectionHeader
              title="Key Academic & Industry Projects"
              sectionKey="projects"
              hiddenSections={content.hiddenSections}
              onToggleHidden={toggleSectionHidden}
              onAdd={() =>
                setContent((c) => ({
                  ...c,
                  projects: [
                    ...c.projects,
                    { id: newId("proj"), name: "", role: "", period: "", link: "", bullets: [] },
                  ],
                }))
              }
              addLabel="+ Add Project"
            />
            {content.projects.map((entry, index) => (
              <details
                key={entry.id}
                ref={(el) => {
                  if (el) detailsRefs.current.set(entry.id, el);
                  else detailsRefs.current.delete(entry.id);
                }}
                className={entryCardClass}
              >
                <EntryHeader
                  title={entry.name || `Project #${index + 1}`}
                  onMoveUp={index > 0 ? () => setContent((c) => ({ ...c, projects: moveArrayItem(c.projects, index, -1) })) : undefined}
                  onMoveDown={index < content.projects.length - 1 ? () => setContent((c) => ({ ...c, projects: moveArrayItem(c.projects, index, 1) })) : undefined}
                  onRemove={() =>
                    setContent((c) => ({
                      ...c,
                      projects: c.projects.filter((_, i) => i !== index),
                    }))
                  }
                />
                <div className="space-y-3 border-t border-[#334155] p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelClass}>Project Name</label>
                      <input
                        data-field={resumeFieldKey({ section: "projects", entryId: entry.id, field: "name" })}
                        value={entry.name}
                        onChange={(e) => updateProject(index, { name: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Role / Scope</label>
                      <input
                        value={entry.role}
                        onChange={(e) => updateProject(index, { role: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Duration / Period</label>
                      <input
                        data-field={resumeFieldKey({ section: "projects", entryId: entry.id, field: "period" })}
                        value={entry.period}
                        onChange={(e) => updateProject(index, { period: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Project Bullets</label>
                    <BulletEditor
                      bullets={entry.bullets}
                      documentId={documentId}
                      dataFieldBase={resumeFieldKey({ section: "projects", entryId: entry.id, field: "bullets" })}
                      onChange={(bullets) => updateProject(index, { bullets })}
                    />
                  </div>
                </div>
              </details>
            ))}
          </section>

          {/* Languages */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("languages", el);
            }}
          >
            <SectionHeader
              title="Languages"
              sectionKey="languages"
              hiddenSections={content.hiddenSections}
              onToggleHidden={toggleSectionHidden}
              onAdd={() => setContent((c) => ({ ...c, languages: [...c.languages, { id: newId("lang"), name: "", level: "" }] }))}
              addLabel="+ Add"
            />
            <div className="space-y-2">
              {content.languages.map((row, index) => (
                <div key={row.id} className="flex items-center gap-2 rounded-lg border border-[#334155] bg-[#1e293b] p-2.5">
                  <input
                    data-field={index === 0 ? resumeFieldKey({ section: "languages", field: "languages" }) : undefined}
                    value={row.name}
                    onChange={(e) => updateLanguage(index, { name: e.target.value })}
                    placeholder="Language"
                    className={inputClass}
                  />
                  <select
                    value={row.level}
                    onChange={(e) => updateLanguage(index, { level: e.target.value })}
                    className="w-36 shrink-0 rounded-lg border border-[#334155] bg-[#0f172a] px-2 py-1.5 text-[13px] text-slate-200"
                  >
                    <option value="">Level</option>
                    <option>Basic</option>
                    <option>Conversational</option>
                    <option>Fluent</option>
                    <option>Native</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setContent((c) => ({ ...c, languages: c.languages.filter((_, i) => i !== index) }))}
                    className="shrink-0 text-[#ef4444] hover:text-red-300"
                  >
                    <OpsIcon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Certifications */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("certifications", el);
            }}
          >
            <SectionHeader title="Certifications" sectionKey="certifications" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.certifications}
              onChange={(items) => setContent((c) => ({ ...c, certifications: items }))}
              placeholder="e.g. Google Data Analytics"
            />
          </section>

          {/* Awards */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("awards", el);
            }}
          >
            <SectionHeader title="Awards & Achievements" sectionKey="awards" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.awards}
              onChange={(items) => setContent((c) => ({ ...c, awards: items }))}
              placeholder="e.g. Dean's List, 2024"
            />
          </section>

          {/* Activities */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("activities", el);
            }}
          >
            <SectionHeader title="Extracurricular Activities" sectionKey="activities" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.activities}
              onChange={(items) => setContent((c) => ({ ...c, activities: items }))}
              placeholder="e.g. Captain, college football team"
            />
          </section>

          {/* Hobbies */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("hobbies", el);
            }}
          >
            <SectionHeader title="Hobbies & Interests" sectionKey="hobbies" hiddenSections={content.hiddenSections} onToggleHidden={toggleSectionHidden} />
            <StringListEditor
              items={content.hobbies}
              onChange={(items) => setContent((c) => ({ ...c, hobbies: items }))}
              placeholder="e.g. Chess, Long-distance running"
            />
          </section>

          {/* Publications */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("publications", el);
            }}
          >
            <SectionHeader
              title="Publications"
              sectionKey="publications"
              hiddenSections={content.hiddenSections}
              onToggleHidden={toggleSectionHidden}
              onAdd={() =>
                setContent((c) => ({
                  ...c,
                  publications: [...c.publications, { id: newId("pub"), title: "", publisher: "", date: "", link: "" }],
                }))
              }
              addLabel="+ Add"
            />
            {content.publications.map((row, index) => (
              <details
                key={row.id}
                ref={(el) => {
                  if (el) detailsRefs.current.set(row.id, el);
                  else detailsRefs.current.delete(row.id);
                }}
                className={entryCardClass}
              >
                <EntryHeader
                  title={row.title || `Publication #${index + 1}`}
                  onRemove={() => setContent((c) => ({ ...c, publications: c.publications.filter((_, i) => i !== index) }))}
                />
                <div className="grid gap-3 border-t border-[#334155] p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Title</label>
                    <input
                      data-field={resumeFieldKey({ section: "publications", entryId: row.id, field: "title" })}
                      value={row.title}
                      onChange={(e) => updatePublication(index, { title: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Publisher / Journal</label>
                    <input value={row.publisher} onChange={(e) => updatePublication(index, { publisher: e.target.value })} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Date</label>
                    <input value={row.date} onChange={(e) => updatePublication(index, { date: e.target.value })} className={inputClass} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Link (optional)</label>
                    <input value={row.link} onChange={(e) => updatePublication(index, { link: e.target.value })} className={inputClass} />
                  </div>
                </div>
              </details>
            ))}
          </section>

          {/* Custom Sections */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("customSections", el);
            }}
          >
            <SectionHeader
              title="Custom Sections"
              sectionKey="customSections"
              hiddenSections={content.hiddenSections}
              onToggleHidden={toggleSectionHidden}
              onAdd={() =>
                setContent((c) => ({
                  ...c,
                  customSections: [...c.customSections, { id: newId("custom"), title: "", items: [] }],
                }))
              }
              addLabel="+ Add Section"
            />
            {content.customSections.map((section, index) => (
              <details
                key={section.id}
                ref={(el) => {
                  if (el) detailsRefs.current.set(section.id, el);
                  else detailsRefs.current.delete(section.id);
                }}
                className={entryCardClass}
              >
                <EntryHeader
                  title={section.title || `Custom Section #${index + 1}`}
                  onRemove={() => setContent((c) => ({ ...c, customSections: c.customSections.filter((_, i) => i !== index) }))}
                />
                <div className="space-y-3 border-t border-[#334155] p-3">
                  <div>
                    <label className={labelClass}>Section Title</label>
                    <input
                      value={section.title}
                      onChange={(e) => updateCustomSection(index, { title: e.target.value })}
                      placeholder="e.g. Volunteering"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Items</label>
                    <BulletEditor
                      bullets={section.items}
                      documentId={documentId}
                      dataFieldBase={resumeFieldKey({ section: "customSections", entryId: section.id, field: "items" })}
                      onChange={(items) => updateCustomSection(index, { items })}
                    />
                  </div>
                </div>
              </details>
            ))}
          </section>

          {/* Action-Outcome-Metric Builder */}
          <section className={`${cardClass} space-y-3`}>
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#a5b4fc]">
              <OpsIcon name="sparkles" size={14} />
              <span>Structured Achievement Builder</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>Action Verb</label>
                <input
                  value={builder.action}
                  onChange={(e) => setBuilder((b) => ({ ...b, action: e.target.value }))}
                  placeholder="e.g. Spearheaded GTM strategy"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Quantified Metric</label>
                <input
                  value={builder.metric}
                  onChange={(e) => setBuilder((b) => ({ ...b, metric: e.target.value }))}
                  placeholder="e.g. delivering 34% CAC reduction"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Outcome / Impact</label>
                <input
                  value={builder.outcome}
                  onChange={(e) => setBuilder((b) => ({ ...b, outcome: e.target.value }))}
                  placeholder="e.g. across 4 regional markets"
                  className={inputClass}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addAchievement}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#4338ca] via-[#4f46e5] to-[#6366f1] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(99,102,241,0.45),inset_0_1px_0_rgba(255,255,255,0.15)]"
            >
              <OpsIcon name="plus" size={13} />
              Append Structured Bullet to Experience
            </button>
          </section>
        </div>

        {/* Live Preview Canvas */}
        <div
          ref={canvasWrapperRef}
          className="flex-1 bg-[radial-gradient(circle_at_20%_20%,#151e36_0%,#0c1020_100%)] p-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:p-8"
        >
          <div
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top center" }}
            className="mx-auto max-w-[820px] overflow-hidden rounded shadow-[0_20px_48px_-10px_rgba(0,0,0,0.12),0_10px_20px_-5px_rgba(0,0,0,0.08)]"
          >
            <ResumePreview content={content} templateId={templateId} onFieldClick={handleFieldClick} />
          </div>
        </div>
      </div>
    </div>
  );
}
