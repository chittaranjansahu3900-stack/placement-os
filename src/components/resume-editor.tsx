"use client";

import { useState } from "react";
import { saveCvDocument, updateCvReviewCommentStatus } from "@/app/actions/resume";
import { ResumeExportButtons } from "@/components/resume-export-buttons";
import { ResumePreview } from "@/components/resume-preview";
import { normalizeCvContent } from "@/lib/resume";
import { CV_TEMPLATES, normalizeCvTemplateId } from "@/lib/resume-templates";
import type {
  CvAcademicEntry,
  CvContent,
  CvExperienceEntry,
  CvProjectEntry,
  CvReviewComment,
} from "@/types/domain";

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500";
const labelClass = "block text-xs font-medium text-neutral-400";

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

function CardHeader({ title, onRemove }: { title: string; onRemove: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-300">{title}</p>
      <button type="button" onClick={onRemove} className="text-xs text-red-400 hover:underline">
        Remove
      </button>
    </div>
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
    if (parts.length < 2) return;
    const drafted = parts.join(" — ");
    setContent((current) => {
      const experience = current.experience.length
        ? current.experience.map((row, index) =>
            index === 0
              ? { ...row, bullets: [...row.bullets, { id: newId("achievement"), text: drafted }] }
              : row,
          )
        : [
            {
              id: newId("experience"),
              company: "",
              role: "",
              period: "",
              bullets: [{ id: newId("achievement"), text: drafted }],
            },
          ];
      return { ...current, experience };
    });
    setBuilder({ action: "", outcome: "", metric: "" });
  }

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(360px,520px)_minmax(560px,1fr)]">
      <div className="space-y-6 print:hidden">
        <form action={saveCvDocument} className="space-y-6">
          <input type="hidden" name="cv_document_id" value={documentId} />
          <input type="hidden" name="content_json" value={JSON.stringify(content)} />
          <input type="hidden" name="template_id" value={templateId} />

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="text-sm font-semibold text-white">CV identity</h2>
            <label className={`${labelClass} mt-3`}>
              Layout template
              <select className={`${inputClass} mt-1`} value={templateId} onChange={(event) => setTemplateId(normalizeCvTemplateId(event.target.value))}>
                {CV_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name} — {template.description}</option>)}
              </select>
            </label>
            <label className={`${labelClass} mt-3`}>
              Internal title
              <input
                className={`${inputClass} mt-1`}
                value={content.title}
                onChange={(event) => setContent({ ...content, title: event.target.value })}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(["name", "email", "phone", "linkedin", "location"] as const).map((field) => (
                <label key={field} className={labelClass}>
                  {field[0].toUpperCase() + field.slice(1)}
                  <input
                    className={`${inputClass} mt-1`}
                    value={content.personalInfo[field]}
                    onChange={(event) => updatePersonal(field, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <label className={`${labelClass} mt-3`}>
              Profile summary
              <textarea
                className={`${inputClass} mt-1 min-h-24`}
                value={content.personalInfo.summary}
                onChange={(event) => updatePersonal("summary", event.target.value)}
              />
            </label>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Academic record</h2>
              <button
                type="button"
                onClick={() =>
                  setContent((current) => ({
                    ...current,
                    academics: [
                      ...current.academics,
                      { id: newId("academic"), institute: "", course: "", year: "", result: "" },
                    ],
                  }))
                }
                className="text-xs text-blue-400 hover:underline"
              >
                Add qualification
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {content.academics.map((row, index) => (
                <div key={row.id} className="rounded-md border border-neutral-800 p-3">
                  <CardHeader
                    title={`Qualification ${index + 1}`}
                    onRemove={() =>
                      setContent((current) => ({
                        ...current,
                        academics: current.academics.filter((_, rowIndex) => rowIndex !== index),
                      }))
                    }
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(["institute", "course", "year", "result"] as const).map((field) => (
                      <input
                        key={field}
                        aria-label={field}
                        placeholder={field}
                        className={inputClass}
                        value={row[field]}
                        onChange={(event) => updateAcademic(index, { [field]: event.target.value })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(["projects", "positions", "experience"] as const).map((section) => (
            <section key={section} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold capitalize text-white">{section}</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (section === "projects") {
                      setContent((current) => ({
                        ...current,
                        projects: [
                          ...current.projects,
                          { id: newId("project"), name: "", role: "", period: "", link: "", bullets: [] },
                        ],
                      }));
                    } else {
                      setContent((current) => ({
                        ...current,
                        [section]: [
                          ...current[section],
                          { id: newId(section), company: "", role: "", period: "", bullets: [] },
                        ],
                      }));
                    }
                  }}
                  className="text-xs text-blue-400 hover:underline"
                >
                  Add item
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {section === "projects"
                  ? content.projects.map((row, index) => (
                      <div key={row.id} className="rounded-md border border-neutral-800 p-3">
                        <CardHeader
                          title={`Project ${index + 1}`}
                          onRemove={() =>
                            setContent((current) => ({
                              ...current,
                              projects: current.projects.filter((_, rowIndex) => rowIndex !== index),
                            }))
                          }
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(["name", "role", "period", "link"] as const).map((field) => (
                            <input
                              key={field}
                              aria-label={field}
                              placeholder={field}
                              className={inputClass}
                              value={row[field]}
                              onChange={(event) => updateProject(index, { [field]: event.target.value })}
                            />
                          ))}
                        </div>
                        <textarea
                          aria-label="Project bullets"
                          placeholder="One achievement bullet per line"
                          className={`${inputClass} mt-2 min-h-24`}
                          value={row.bullets.map((bullet) => bullet.text).join("\n")}
                          onChange={(event) =>
                            updateProject(index, {
                              bullets: linesToBullets(event.target.value, row.bullets, row.id),
                            })
                          }
                        />
                      </div>
                    ))
                  : content[section].map((row, index) => (
                      <div key={row.id} className="rounded-md border border-neutral-800 p-3">
                        <CardHeader
                          title={`${section === "experience" ? "Experience" : "Position"} ${index + 1}`}
                          onRemove={() =>
                            setContent((current) => ({
                              ...current,
                              [section]: current[section].filter((_, rowIndex) => rowIndex !== index),
                            }))
                          }
                        />
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input
                            aria-label={section === "experience" ? "Company" : "Organisation"}
                            placeholder={section === "experience" ? "Company" : "Organisation"}
                            className={inputClass}
                            value={row.company}
                            onChange={(event) => updateExperience(section, index, { company: event.target.value })}
                          />
                          <input
                            aria-label="Role"
                            placeholder="Role"
                            className={inputClass}
                            value={row.role}
                            onChange={(event) => updateExperience(section, index, { role: event.target.value })}
                          />
                          <input
                            aria-label="Period"
                            placeholder="Period"
                            className={inputClass}
                            value={row.period}
                            onChange={(event) => updateExperience(section, index, { period: event.target.value })}
                          />
                        </div>
                        <textarea
                          aria-label={`${section} bullets`}
                          placeholder="One achievement bullet per line"
                          className={`${inputClass} mt-2 min-h-24`}
                          value={row.bullets.map((bullet) => bullet.text).join("\n")}
                          onChange={(event) =>
                            updateExperience(section, index, {
                              bullets: linesToBullets(event.target.value, row.bullets, row.id),
                            })
                          }
                        />
                      </div>
                    ))}
              </div>
            </section>
          ))}

          <section className="rounded-lg border border-blue-900 bg-blue-950/30 p-4">
            <h2 className="text-sm font-semibold text-blue-200">Fact-safe achievement builder</h2>
            <p className="mt-1 text-xs text-blue-300/70">
              Uses only the facts you enter. It adds the draft to your first experience item; review it before saving.
            </p>
            <div className="mt-3 grid gap-2">
              {(["action", "outcome", "metric"] as const).map((field) => (
                <input
                  key={field}
                  className={inputClass}
                  placeholder={
                    field === "action"
                      ? "Action: what did you do?"
                      : field === "outcome"
                        ? "Outcome: what changed?"
                        : "Metric: what number proves it?"
                  }
                  value={builder[field]}
                  onChange={(event) => setBuilder({ ...builder, [field]: event.target.value })}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addAchievement}
              className="mt-3 rounded-md border border-blue-700 px-3 py-2 text-xs text-blue-200 hover:bg-blue-900"
            >
              Draft achievement bullet
            </button>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="text-sm font-semibold text-white">Skills, certifications &amp; awards</h2>
            <label className={`${labelClass} mt-3`}>
              Skills (comma-separated)
              <textarea
                className={`${inputClass} mt-1 min-h-20`}
                value={content.skills.join(", ")}
                onChange={(event) =>
                  setContent({
                    ...content,
                    skills: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                  })
                }
              />
            </label>
            {(["certifications", "awards"] as const).map((field) => (
              <label key={field} className={`${labelClass} mt-3 capitalize`}>
                {field} (one per line)
                <textarea
                  className={`${inputClass} mt-1 min-h-20`}
                  value={content[field].join("\n")}
                  onChange={(event) =>
                    setContent({ ...content, [field]: event.target.value.split("\n") })
                  }
                />
              </label>
            ))}
          </section>

          <div className="sticky bottom-4 flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900/95 p-3 shadow-xl backdrop-blur">
            <p className="text-xs text-neutral-400">Saving makes this the CV attached to your next application.</p>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
              Save CV
            </button>
          </div>
        </form>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="text-sm font-semibold text-white">SPC review comments</h2>
          <div className="mt-3 space-y-3">
            {comments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-blue-300">
                      {comment.anchor_section}
                      {comment.anchor_bullet_id ? ` · ${comment.anchor_bullet_id}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-neutral-200">{comment.comment_text}</p>
                    <p className="mt-1 text-xs text-neutral-600">{comment.users?.name ?? "SPC reviewer"}</p>
                  </div>
                  <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400">
                    {comment.status}
                  </span>
                </div>
                {comment.status === "open" && (
                  <div className="mt-3 flex gap-2">
                    {(["applied", "dismissed"] as const).map((status) => (
                      <form key={status} action={updateCvReviewCommentStatus}>
                        <input type="hidden" name="comment_id" value={comment.id} />
                        <input type="hidden" name="cv_document_id" value={documentId} />
                        <input type="hidden" name="status" value={status} />
                        <button type="submit" className="text-xs text-blue-400 hover:underline">
                          Mark {status}
                        </button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {comments.length === 0 && <p className="text-sm text-neutral-500">No review comments yet.</p>}
          </div>
        </section>
      </div>

      <div className="sticky top-8 space-y-3">
        <div className="flex items-center justify-between print:hidden">
          <p className="text-xs text-neutral-500">Live placement-cell preview</p>
          <ResumeExportButtons fileName={content.personalInfo.name || content.title} content={content} templateId={templateId} />
        </div>
        <ResumePreview content={content} templateId={templateId} />
      </div>
    </div>
  );
}
