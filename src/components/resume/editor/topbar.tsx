"use client";

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
import { TopbarDropdown } from "@/components/resume/topbar-dropdown";
import { normalizeCvContent } from "@/lib/resume";
import { OpsIcon } from "@/components/shared/ops-icon";
import {
  inputClass,
  topbarBtnClass,
  topbarBtnPrimaryClass,
  urgency,
  type CvVersionRow,
  type ReviewCommentWithAuthor,
  type UpcomingJd,
} from "./shared";
import type { CompanyTypePersona, CvContent } from "@/types/domain";

export function ResumeTopbar({
  documentId,
  content,
  templateId,
  comments,
  versions,
  personas,
  upcomingJds,
  onOpenAiAssistant,
  onOpenCommandPalette,
}: {
  documentId: string;
  content: CvContent;
  templateId: string;
  comments: ReviewCommentWithAuthor[];
  versions: CvVersionRow[];
  personas: CompanyTypePersona[];
  upcomingJds: UpcomingJd[];
  onOpenAiAssistant: () => void;
  onOpenCommandPalette: () => void;
}) {
  const currentVersion = versions.find((v) => v.id === documentId);
  const nearestDeadline = upcomingJds[0] ? urgency(upcomingJds[0].apply_by_deadline) : null;

  const pillTriggerClass = (open: boolean, activeTone = "border-[#334155] text-slate-300 hover:border-slate-600") =>
    `${topbarBtnClass} ${open ? "border-[#4f46e5] bg-[#1e293b] text-white" : `bg-[#1e293b] ${activeTone}`}`;

  return (
    <div
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 rounded-lg border-b border-white/[0.09] px-4 py-3 shadow-sm backdrop-blur-xl"
      style={{ background: "linear-gradient(180deg,#0d1428 0%,#090d1c 100%)" }}
    >
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
                href={`/resume/studio?cv=${v.id}`}
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
        {/* Command Palette trigger */}
        <button
          type="button"
          data-cmd="open-command-palette"
          onClick={onOpenCommandPalette}
          title="Command palette (Ctrl+K)"
          className={topbarBtnClass}
        >
          <OpsIcon name="search" size={13} />
          <span className="hidden sm:inline">Search</span>
          <span className="ml-1 hidden rounded border border-white/10 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">Ctrl K</span>
        </button>

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

        {/* AI Resume Assistant — opens as a right-edge drawer */}
        <button
          type="button"
          data-cmd="open-ai-assistant"
          onClick={onOpenAiAssistant}
          className={`${topbarBtnClass} border-[#4f46e5] text-[#a5b4fc] hover:text-white`}
        >
          <OpsIcon name="sparkles" size={13} />
          <span>AI Assistant</span>
        </button>
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
          <button type="submit" data-cmd="save" className={topbarBtnPrimaryClass}>
            <OpsIcon name="check" size={13} />
            <span>Save CV Document</span>
          </button>
        </form>
      </div>
    </div>
  );
}
