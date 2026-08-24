"use client";

import { useRef, useState } from "react";
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
import { ResumeExportButtons } from "@/components/resume-export-buttons";
import { ResumeAiAssistant } from "@/components/resume-ai-assistant";
import { ResumePreview, resumeFieldKey, type ResumeFieldSpec } from "@/components/resume-preview";
import { TopbarDropdown } from "@/components/topbar-dropdown";
import { normalizeCvContent } from "@/lib/resume";
import { CV_TEMPLATES, normalizeCvTemplateId } from "@/lib/resume-templates";
import { OpsIcon, type OpsIconName } from "@/components/ops-icon";
import type {
  CompanyTypePersona,
  CvAcademicEntry,
  CvContent,
  CvDocument,
  CvExperienceEntry,
  CvProjectEntry,
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

const inputClass =
  "w-full rounded-lg border border-[#334155] bg-[#0f172a] px-2.5 py-1.5 text-[13px] text-slate-200 outline-none transition-colors focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]";
const labelClass = "block text-[11px] font-medium uppercase tracking-[0.05em] text-slate-500";
const addButtonClass =
  "rounded-lg border border-dashed border-[#334155] px-2.5 py-1 text-xs text-[#64748b] transition-colors hover:border-[#4f46e5] hover:text-[#94a3b8]";
const cardClass = "rounded-lg border border-[#334155] bg-[#0f172a] p-4 shadow-sm";
const entryCardClass =
  "group mb-2 overflow-hidden rounded-lg border border-[#334155] bg-[#1e293b] open:border-l-[3px] open:border-l-[#6366f1] open:shadow-[0_6px_20px_rgba(0,0,0,0.3)]";

type ReviewCommentWithAuthor = CvReviewComment & { users?: { name: string } | null };

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function linesToBullets(value: string, current: { id: string; text: string }[], prefix: string) {
  return value.split("\n").map((line, index) => ({
    id: current[index]?.id ?? newId(prefix),
    text: line,
  }));
}

const RAIL_SECTIONS: { key: string; label: string; icon: OpsIconName }[] = [
  { key: "personal", label: "Personal & Contact", icon: "user" },
  { key: "academics", label: "Academic Records", icon: "graduation-cap" },
  { key: "experience", label: "Experience", icon: "briefcase" },
  { key: "projects", label: "Projects", icon: "layers" },
];

function EntryHeader({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-[13px] font-medium text-slate-200 hover:text-white">
      <span className="min-w-0 truncate">{title}</span>
      <span className="flex shrink-0 items-center gap-2">
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

  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const detailsRefs = useRef(new Map<string, HTMLDetailsElement>());

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

  return (
    <div className="space-y-4">
      {/* Unified Topbar — CV switcher, tool panels, template, save, export */}
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
              <span
                title="Original CV File"
                className={`flex size-8 items-center justify-center rounded-lg border transition-colors ${open ? "border-[#4f46e5] text-white" : "border-[#334155] text-slate-400 hover:text-slate-200"}`}
              >
                <OpsIcon name="upload" size={14} />
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
                <span
                  title="JD Keyword Fit Score"
                  className={`flex size-8 items-center justify-center rounded-lg border transition-colors ${open ? "border-[#4f46e5] text-white" : "border-[#334155] text-slate-400 hover:text-slate-200"}`}
                >
                  <OpsIcon name="sparkles" size={14} />
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
              <span
                title="Application Deadlines"
                className={`relative flex size-8 items-center justify-center rounded-lg border transition-colors ${open ? "border-[#4f46e5] text-white" : "border-[#334155] text-slate-400 hover:text-slate-200"}`}
              >
                <OpsIcon name="clock" size={14} />
                {nearestDeadline && (
                  <span className="absolute -right-1 -top-1 size-2 rounded-full bg-amber-400" />
                )}
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
                <span
                  title={`Review Remarks (${comments.length})`}
                  className={`relative flex size-8 items-center justify-center rounded-lg border transition-colors ${open ? "border-[#4f46e5] text-white" : "border-amber-700 bg-amber-950/40 text-amber-400 hover:text-amber-300"}`}
                >
                  <OpsIcon name="message-square" size={14} />
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
                    {comments.length}
                  </span>
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
              <span
                title="AI Resume Assistant"
                className={`flex size-8 items-center justify-center rounded-lg border transition-colors ${open ? "border-[#6366f1] bg-[#1e293b] text-white" : "border-[#4f46e5] bg-[#1e1b4b] text-[#a5b4fc] hover:text-white"}`}
              >
                <OpsIcon name="sparkles" size={14} />
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

          <div className="h-6 w-px bg-[#334155]" />

          {/* Full View / Export */}
          <Link
            href={`/resume/${documentId}`}
            title="Full View / Export"
            className="flex size-8 items-center justify-center rounded-lg border border-[#334155] text-slate-400 hover:text-slate-200"
          >
            <OpsIcon name="eye" size={14} />
          </Link>

          <select
            value={templateId}
            onChange={(event) => setTemplateId(normalizeCvTemplateId(event.target.value))}
            className="rounded-full border border-[#334155] bg-[#1e293b] px-3 py-1.5 text-xs font-medium text-white outline-none focus:border-[#6366f1]"
          >
            {CV_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>

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

      {/* Editor + Live Canvas */}
      <div className="overflow-hidden rounded-lg border border-[#334155] bg-[#080f21] lg:flex lg:items-stretch">
        {/* Icon rail */}
        <div className="flex shrink-0 flex-row gap-1 border-b border-[#1e293b] bg-[#030507] p-2 lg:w-[46px] lg:flex-col lg:border-b-0 lg:border-r lg:py-4">
          {RAIL_SECTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              title={section.label}
              onClick={() => scrollToSection(section.key)}
              className="relative flex size-[38px] items-center justify-center rounded-lg text-[#4e6280] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[#94a3b8]"
            >
              <OpsIcon name={section.icon} size={17} />
            </button>
          ))}
        </div>

        {/* Form column */}
        <div className="min-w-0 flex-1 space-y-4 p-4 lg:max-h-[calc(100vh-180px)] lg:max-w-[420px] lg:flex-none lg:overflow-y-auto lg:border-r lg:border-[#1e293b] lg:p-5">
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
              <div>
                <label className={labelClass}>Full Candidate Name</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "name" })}
                  value={content.personalInfo.name}
                  onChange={(event) => updatePersonal("name", event.target.value)}
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
                <label className={labelClass}>LinkedIn / Portfolio URL</label>
                <input
                  data-field={resumeFieldKey({ section: "personal", field: "linkedin" })}
                  value={content.personalInfo.linkedin}
                  onChange={(event) => updatePersonal("linkedin", event.target.value)}
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
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Academic Record Entries
              </h2>
              <button
                type="button"
                onClick={() =>
                  setContent((c) => ({
                    ...c,
                    academics: [
                      ...c.academics,
                      { id: newId("acad"), course: "", institute: "", year: "", result: "" },
                    ],
                  }))
                }
                className={addButtonClass}
              >
                + Add Row
              </button>
            </div>
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

          {/* Experience & Internships */}
          <section
            ref={(el) => {
              if (el) sectionRefs.current.set("experience", el);
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Internships &amp; Professional Experience
              </h2>
              <button
                type="button"
                onClick={() =>
                  setContent((c) => ({
                    ...c,
                    experience: [
                      ...c.experience,
                      { id: newId("exp"), company: "", role: "", period: "", bullets: [] },
                    ],
                  }))
                }
                className={addButtonClass}
              >
                + Add Experience
              </button>
            </div>
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
                    <label className={labelClass}>Achievement Bullets (one line per bullet)</label>
                    <textarea
                      data-field={resumeFieldKey({ section: "experience", entryId: entry.id, field: "bullets" })}
                      value={entry.bullets.map((b) => b.text).join("\n")}
                      onChange={(e) =>
                        updateExperience("experience", index, {
                          bullets: linesToBullets(e.target.value, entry.bullets, "bullet"),
                        })
                      }
                      rows={4}
                      className={inputClass}
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
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                Key Academic &amp; Industry Projects
              </h2>
              <button
                type="button"
                onClick={() =>
                  setContent((c) => ({
                    ...c,
                    projects: [
                      ...c.projects,
                      { id: newId("proj"), name: "", role: "", period: "", link: "", bullets: [] },
                    ],
                  }))
                }
                className={addButtonClass}
              >
                + Add Project
              </button>
            </div>
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
                    <label className={labelClass}>Project Bullets (one line per bullet)</label>
                    <textarea
                      data-field={resumeFieldKey({ section: "projects", entryId: entry.id, field: "bullets" })}
                      value={entry.bullets.map((b) => b.text).join("\n")}
                      onChange={(e) =>
                        updateProject(index, {
                          bullets: linesToBullets(e.target.value, entry.bullets, "proj-b"),
                        })
                      }
                      rows={3}
                      className={inputClass}
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
        <div className="flex-1 bg-[radial-gradient(circle_at_20%_20%,#151e36_0%,#0c1020_100%)] p-6 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:p-8">
          <div className="mx-auto max-w-[820px] overflow-hidden rounded shadow-[0_20px_48px_-10px_rgba(0,0,0,0.12),0_10px_20px_-5px_rgba(0,0,0,0.08)]">
            <ResumePreview content={content} templateId={templateId} onFieldClick={handleFieldClick} />
          </div>
        </div>
      </div>
    </div>
  );
}
