"use client";

import { useRef, useState } from "react";
import { saveCvDocument, updateCvReviewCommentStatus } from "@/app/actions/resume";
import { ResumeExportButtons } from "@/components/resume-export-buttons";
import { ResumeAiAssistant } from "@/components/resume-ai-assistant";
import { ResumePreview, resumeFieldKey, type ResumeFieldSpec } from "@/components/resume-preview";
import { normalizeCvContent } from "@/lib/resume";
import { CV_TEMPLATES, normalizeCvTemplateId } from "@/lib/resume-templates";
import { OpsIcon, type OpsIconName } from "@/components/ops-icon";
import type {
  CvAcademicEntry,
  CvContent,
  CvExperienceEntry,
  CvProjectEntry,
  CvReviewComment,
} from "@/types/domain";

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
}: {
  documentId: string;
  initialContent: CvContent;
  initialTemplateId: string;
  comments: ReviewCommentWithAuthor[];
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

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#0f172a] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-mono font-semibold uppercase text-slate-500">Template:</label>
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
        </div>
        <div className="flex items-center gap-2">
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

      {/* Review Comments Alert */}
      {comments.length > 0 && (
        <section className="rounded-lg border border-amber-800/80 bg-slate-900/95 p-4 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
            <OpsIcon name="sparkles" size={14} className="text-amber-400" />
            <span>SPC Committee Review Remarks ({comments.length})</span>
          </h2>
          <div className="space-y-2">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs">
                <div className="flex items-center justify-between text-slate-400 font-mono text-[10px] uppercase">
                  <span>
                    {comment.anchor_section}
                    {comment.anchor_bullet_id ? ` · ${comment.anchor_bullet_id}` : ""}
                  </span>
                  <span className={comment.status === "applied" ? "text-emerald-400 font-bold" : "text-amber-400"}>
                    {comment.status}
                  </span>
                </div>
                <p className="mt-1 text-slate-200">{comment.comment_text}</p>
                <div className="mt-2 flex gap-2">
                  {(["open", "applied", "dismissed"] as const).map((status) => (
                    <form
                      key={status}
                      action={updateCvReviewCommentStatus}
                    >
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <input type="hidden" name="cv_document_id" value={documentId} />
                      <input type="hidden" name="status" value={status} />
                      <button
                        type="submit"
                        disabled={comment.status === status}
                        className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-700 disabled:opacity-40"
                      >
                        Mark {status}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI Assistant */}
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
        <div className="min-w-0 flex-1 space-y-4 p-4 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto lg:border-r lg:border-[#1e293b] lg:p-5">
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
