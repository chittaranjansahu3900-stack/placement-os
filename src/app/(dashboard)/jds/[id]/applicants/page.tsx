import Link from "next/link";
import { bulkUpdateApplicationStatus, updateApplicationStatus } from "@/app/actions/applicants";
import { confirmPlacement } from "@/app/actions/placements";
import { assignInterviewRound } from "@/app/actions/spc";
import { addPrivateNote } from "@/app/actions/private-notes";
import { CandidatePacket } from "@/components/candidate-packet";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { loadCandidatePackets } from "@/lib/candidate-packets";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import { BulkApplicantActions } from "@/components/bulk-applicant-actions";
import {
  EligibilitySignalRail,
  type EligibilitySignalItem,
} from "@/components/eligibility-signal-rail";
import type { ApplicantDirectoryRow, ApplicationPrivateNote } from "@/types/domain";

const ACTIONS = ["shortlisted", "interview", "selected", "waitlisted", "rejected"] as const;
const SCHEDULABLE_STATUSES = ["shortlisted", "interview", "waitlisted"];
const FILTER_STATUSES = ["applied", "under_review", "shortlisted", "interview", "selected", "waitlisted", "rejected"] as const;
const SORTS = ["cgpa", "name", "work_ex", "applied_at", "status"] as const;
type SortKey = (typeof SORTS)[number];

type ApplicantJdSummary = {
  role_title: string;
  company_id: string;
  min_cgpa: number | null;
  eligible_branches: string[];
  eligible_specializations: string[];
  companies: { name: string } | null;
};

function matchesAllowed(allowed: string[], value: string | null): EligibilitySignalItem["state"] {
  if (allowed.length === 0) return "pass";
  if (!value) return "unknown";
  return allowed.some((item) => item.localeCompare(value, undefined, { sensitivity: "base" }) === 0)
    ? "pass"
    : "fail";
}

function eligibilitySignals(row: ApplicantDirectoryRow, jd: ApplicantJdSummary): EligibilitySignalItem[] {
  const cgpaState =
    jd.min_cgpa == null ? "pass" : row.cgpa == null ? "unknown" : row.cgpa >= jd.min_cgpa ? "pass" : "fail";

  return [
    {
      label: "CGPA",
      state: cgpaState,
      detail:
        jd.min_cgpa == null
          ? "No cutoff configured"
          : row.cgpa == null
            ? `Missing value; requires ${jd.min_cgpa}`
            : `${row.cgpa.toFixed(2)} against ${jd.min_cgpa}`,
    },
    {
      label: "Branch",
      state: matchesAllowed(jd.eligible_branches, row.branch),
      detail: jd.eligible_branches.length === 0 ? "All branches accepted" : row.branch ?? "Missing branch",
    },
    {
      label: "Spec",
      state: matchesAllowed(jd.eligible_specializations, row.specialization),
      detail:
        jd.eligible_specializations.length === 0
          ? "All specializations accepted"
          : row.specialization ?? "Missing specialization",
    },
  ];
}

type ApplicantSearchParams = {
  error?: string;
  notice?: string;
  updated?: string;
  status?: string;
  q?: string;
  application_status?: string;
  branch?: string;
  specialization?: string;
  min_cgpa?: string;
  min_work_ex?: string;
  sort?: string;
  direction?: string;
  packet?: string;
};

function numberFilter(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function compareNullable(left: number | null, right: number | null, direction: number): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return (left - right) * direction;
}

function sortApplicants(rows: ApplicantDirectoryRow[], sort: SortKey, direction: "asc" | "desc") {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (sort === "cgpa") return compareNullable(left.cgpa, right.cgpa, factor);
    if (sort === "work_ex") return (left.total_work_ex_months - right.total_work_ex_months) * factor;
    if (sort === "applied_at") return (new Date(left.applied_at).getTime() - new Date(right.applied_at).getTime()) * factor;
    const leftValue = sort === "status" ? left.status : left.name;
    const rightValue = sort === "status" ? right.status : right.name;
    return leftValue.localeCompare(rightValue) * factor;
  });
}

function listHref(id: string, search: ApplicantSearchParams, packet?: string): string {
  const query = new URLSearchParams();
  for (const key of ["q", "application_status", "branch", "specialization", "min_cgpa", "min_work_ex", "sort", "direction"] as const) {
    if (search[key]) query.set(key, search[key]);
  }
  if (packet) query.set("packet", packet);
  const suffix = query.toString();
  return `/jds/${id}/applicants${suffix ? `?${suffix}` : ""}${packet ? "#candidate-packet" : ""}`;
}

export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ApplicantSearchParams>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const [ctx, supabase] = await Promise.all([getCurrentUserContext(), createClient()]);
  const canConfirmPlacement = !!ctx && ctx.permissionNames.has("Student Data - Full");
  const canSeePrivateNotes =
    !!ctx &&
    (ctx.permissionNames.has("Shortlisting (recruiter-scoped)") ||
      ctx.permissionNames.has("Shortlist Oversight") ||
      ctx.permissionNames.has("Student Data - Full"));

  const [{ data: jd }, { data: applicants }] = await Promise.all([
    supabase
      .from("jds")
      .select("role_title, company_id, min_cgpa, eligible_branches, eligible_specializations, companies(name)")
      .eq("id", id)
      .single(),
    supabase.from("applicant_directory").select("*").eq("jd_id", id),
  ]);
  const typedJd = jd as unknown as ApplicantJdSummary | null;
  const allRows = (applicants ?? []) as ApplicantDirectoryRow[];
  const branches = [...new Set(allRows.map((row) => row.branch).filter((branch): branch is string => Boolean(branch)))].sort();
  const specializations = [...new Set(allRows.map((row) => row.specialization).filter((value): value is string => Boolean(value)))].sort();
  const minCgpa = numberFilter(search.min_cgpa);
  const minWorkEx = numberFilter(search.min_work_ex);
  const query = search.q?.trim().toLocaleLowerCase() ?? "";
  const sort = SORTS.includes(search.sort as SortKey) ? (search.sort as SortKey) : "cgpa";
  const direction = search.direction === "asc" ? "asc" : "desc";

  const rows = sortApplicants(
    allRows.filter((row) => {
      if (query && !`${row.name} ${row.roll_no}`.toLocaleLowerCase().includes(query)) return false;
      if (search.application_status && row.status !== search.application_status) return false;
      if (search.branch && row.branch !== search.branch) return false;
      if (search.specialization && row.specialization !== search.specialization) return false;
      if (minCgpa != null && (row.cgpa == null || row.cgpa < minCgpa)) return false;
      if (minWorkEx != null && row.total_work_ex_months < minWorkEx) return false;
      return true;
    }),
    sort,
    direction
  );

  const applicationIds = allRows.map((row) => row.application_id);
  const studentIds = allRows.map((row) => row.student_id);
  const [{ data: applicationCvRows }, { data: existingPlacements }] = await Promise.all([
    applicationIds.length ? supabase.from("applications").select("id, cv_document_id").in("id", applicationIds) : Promise.resolve({ data: [] }),
    studentIds.length ? supabase.from("placement_records").select("student_id, final_ctc").in("student_id", studentIds) : Promise.resolve({ data: [] }),
  ]);
  const cvByApplication = new Map((applicationCvRows ?? []).map((application) => [application.id, application.cv_document_id]));
  const placementByStudent = new Map((existingPlacements ?? []).map((placement) => [placement.student_id, placement]));

  const { data: noteRows } = canSeePrivateNotes && applicationIds.length
    ? await supabase.from("application_private_notes").select("*").in("application_id", applicationIds).order("created_at", { ascending: false })
    : { data: [] };
  const notesByApplication = new Map<string, ApplicationPrivateNote[]>();
  for (const note of (noteRows ?? []) as ApplicationPrivateNote[]) {
    const list = notesByApplication.get(note.application_id) ?? [];
    list.push(note);
    notesByApplication.set(note.application_id, list);
  }
  const packetApplicant = search.packet ? allRows.find((row) => row.application_id === search.packet) : undefined;
  const selectedPackets = packetApplicant ? await loadCandidatePackets(supabase, [packetApplicant]) : [];
  const packetEligibleCount = allRows.length;

  return (
    <div className="space-y-6">
      {/* Header Matrix Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Link href="/jds" className="hover:text-amber-400 transition-colors">JDs</Link>
            <span>/</span>
            <span className="text-slate-200">{typedJd?.companies?.name ?? "Company"}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>{typedJd?.role_title ?? "Job Description"}</span>
            <span className="rounded-md bg-blue-950/80 border border-blue-800/60 px-2 py-0.5 font-mono text-xs font-semibold text-blue-300">
              {rows.length} Candidates
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400 flex items-center gap-2">
            <OpsIcon name="shield" size={13} className="text-amber-400" />
            <span>Section 7.4 Compliance: Contact telemetry automatically unlocks upon Shortlisting.</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {packetEligibleCount > 0 && (
            <Link
              href={`/jds/${id}/applicants/packets`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-slate-600 hover:bg-slate-700 hover:text-white transition-all shadow-sm"
            >
              <OpsIcon name="download" size={14} />
              <span>Merged Candidate Packets ({packetEligibleCount})</span>
            </Link>
          )}
        </div>
      </div>

      {/* Notifications */}
      {search.error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3.5 text-xs text-red-200">
          <OpsIcon name="alert-triangle" size={16} className="text-red-400 shrink-0" />
          <span>{search.error}</span>
        </div>
      )}
      {search.updated && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/50 p-3.5 text-xs text-emerald-200">
          <OpsIcon name="check" size={16} className="text-emerald-400 shrink-0" />
          <span>
            Updated <strong className="font-mono">{search.updated}</strong> candidate{Number(search.updated) === 1 ? "" : "s"} to{" "}
            <StatusBadge status={search.status || ""} size="sm" />
          </span>
        </div>
      )}

      {/* Tactical Multi-Criteria Filter Bar */}
      <form method="get" className="rounded-xl border border-slate-800/90 bg-slate-900/70 p-4 backdrop-blur-md">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 xl:col-span-2">
            Search Candidate / Roll
            <div className="relative mt-1">
              <OpsIcon name="search" size={14} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                name="q"
                defaultValue={search.q}
                placeholder="Name / Roll No..."
                className="w-full rounded-lg border border-slate-700/80 bg-slate-950/90 pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
          </label>

          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Status
            <select
              name="application_status"
              defaultValue={search.application_status ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 text-xs capitalize text-white outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              {FILTER_STATUSES.map((value) => (
                <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Branch
            <select
              name="branch"
              defaultValue={search.branch ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            >
              <option value="">All Branches</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Specialization
            <select
              name="specialization"
              defaultValue={search.specialization ?? ""}
              className="mt-1 block w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            >
              <option value="">All Specializations</option>
              {specializations.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Min CGPA
            <input
              name="min_cgpa"
              type="number"
              min="0"
              max="10"
              step="0.01"
              defaultValue={search.min_cgpa}
              placeholder="e.g. 8.0"
              className="mt-1 block w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Min Work-Ex
            <input
              name="min_work_ex"
              type="number"
              min="0"
              step="1"
              defaultValue={search.min_work_ex}
              placeholder="Months"
              className="mt-1 block w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Sort
            <select
              name="sort"
              defaultValue={sort}
              className="mt-1 block w-full rounded-lg border border-slate-700/80 bg-slate-950/90 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
            >
              <option value="cgpa">CGPA</option>
              <option value="name">Name</option>
              <option value="work_ex">Work Experience</option>
              <option value="applied_at">Applied Date</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>

        <div className="mt-3.5 flex items-center justify-between border-t border-slate-800/80 pt-3">
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <OpsIcon name="filter" size={13} />
              <span>Apply Filters</span>
            </button>
            <Link
              href={`/jds/${id}/applicants`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <OpsIcon name="refresh" size={13} />
              <span>Reset</span>
            </Link>
          </div>
          <span className="font-mono text-xs text-slate-400">
            Showing {rows.length} of {allRows.length} candidates
          </span>
        </div>
      </form>

      {/* Candidate Packet Drawer */}
      {selectedPackets[0] && (
        <section id="candidate-packet" className="scroll-mt-6 rounded-lg border border-blue-800 bg-blue-950/20 p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-blue-900/60 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-900/60 text-blue-300">
                <OpsIcon name="file-text" size={16} />
              </div>
              <div>
                <h2 className="font-bold text-white text-sm">Verified Candidate Profile Sheet &amp; CV Packet</h2>
                <p className="text-[11px] text-slate-400">Immutable profile verified by CDPO and applicant at submission.</p>
              </div>
            </div>
            <Link href={listHref(id, search)} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              Close Preview ×
            </Link>
          </div>
          <CandidatePacket packet={selectedPackets[0]} />
        </section>
      )}

      {allRows.length > 0 && (
        <BulkApplicantActions action={bulkUpdateApplicationStatus.bind(null, id)} />
      )}

      {/* Core Tabular Matrix */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0a0f1b]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#0e1626] text-[11px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 pl-4 pr-2 font-medium w-10">
                <span className="sr-only">Select</span>
              </th>
              <th className="py-3 pr-4 font-medium">Candidate Profile</th>
              <th className="py-3 pr-3 font-medium font-mono text-center">CGPA</th>
              <th className="py-3 pr-3 font-medium font-mono text-center">Work-Ex</th>
              <th className="py-3 pr-4 font-medium">Branch / Specialization</th>
              <th className="py-3 pr-4 font-medium">Eligibility Signal</th>
              <th className="py-3 pr-4 font-medium">Contact Telemetry</th>
              <th className="py-3 pr-4 font-medium">Stage Status</th>
              <th className="py-3 pr-4 font-medium">Interview Round</th>
              <th className="py-3 pr-4 font-medium">Placement Status</th>
              {canSeePrivateNotes && <th className="py-3 pr-3 font-medium">Recruiter Notes</th>}
              <th className="py-3 pr-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 font-sans">
            {rows.map((row) => {
              const latestRound = row.round_history[row.round_history.length - 1];
              const canSchedule = SCHEDULABLE_STATUSES.includes(row.status);
              const cvId = cvByApplication.get(row.application_id);
              const placement = placementByStudent.get(row.student_id);
              const notes = notesByApplication.get(row.application_id) ?? [];
              const isShortlistedOrAbove = row.status !== "applied" && row.status !== "under_review";

              return (
                <tr
                  key={row.application_id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isShortlistedOrAbove ? "bg-emerald-950/10" : ""
                  }`}
                >
                  {/* Checkbox */}
                  <td className="py-3 pl-4 pr-2 align-middle">
                    <input
                      type="checkbox"
                      name="application_ids"
                      value={row.application_id}
                      form="bulk-applicant-actions"
                      aria-label={`Select ${row.name}`}
                      className="size-4 rounded border-slate-700 bg-slate-900 text-blue-600 accent-blue-600 focus:ring-blue-500/20"
                    />
                  </td>

                  {/* Candidate Identity */}
                  <td className="py-3 pr-4 align-top">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex size-7 items-center justify-center rounded-md bg-slate-800 text-[11px] font-bold text-amber-400 font-mono border border-slate-700">
                        {row.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs">{row.name}</span>
                          <span className="font-mono text-[11px] text-slate-400">({row.roll_no})</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <Link
                            href={listHref(id, search, row.application_id)}
                            className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-medium"
                          >
                            <OpsIcon name="file-text" size={11} />
                            <span>View Packet</span>
                          </Link>
                          {cvId && (
                            <a
                              href={`/api/files/application-cv?application=${encodeURIComponent(row.application_id)}`}
                              className="text-slate-400 hover:text-white hover:underline flex items-center gap-1"
                            >
                              <OpsIcon name="download" size={11} />
                              <span>Original CV</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* CGPA */}
                  <td className="py-3 pr-3 text-center align-top font-mono font-bold text-amber-300">
                    {row.cgpa ? row.cgpa.toFixed(2) : "—"}
                  </td>

                  {/* Work-Ex */}
                  <td className="py-3 pr-3 text-center align-top font-mono text-slate-300">
                    {row.total_work_ex_months} mo
                  </td>

                  {/* Branch & Specialization */}
                  <td className="py-3 pr-4 align-top">
                    <p className="text-slate-200 font-medium">{row.branch ?? "—"}</p>
                    <p className="text-[11px] text-slate-500">{row.specialization ?? "General Management"}</p>
                  </td>

                  <td className="py-3 pr-4 align-top">
                    {typedJd ? (
                      <EligibilitySignalRail items={eligibilitySignals(row, typedJd)} compact />
                    ) : (
                      <span className="font-mono text-slate-500">—</span>
                    )}
                  </td>

                  {/* Contact Telemetry — Signature Fair Hiring Unmasking */}
                  <td className="py-3 pr-4 align-top">
                    {row.phone || row.personal_email ? (
                      <div className="inline-flex flex-col gap-0.5 rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-1.5 font-mono text-[11px] text-emerald-200">
                        <div className="flex items-center gap-1.5">
                          <OpsIcon name="unlock" size={12} className="text-emerald-400" />
                          <span>{row.phone}</span>
                        </div>
                        {row.personal_email && (
                          <span className="text-[10px] text-emerald-300/80 truncate max-w-[160px]">{row.personal_email}</span>
                        )}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-[11px] text-slate-500">
                        <OpsIcon name="lock" size={12} className="text-slate-500" />
                        <span className="tracking-widest">••••••••••</span>
                      </div>
                    )}
                  </td>

                  {/* Stage Status */}
                  <td className="py-3 pr-4 align-top">
                    <StatusBadge status={row.status} size="sm" />
                  </td>

                  {/* Next Round Telemetry */}
                  <td className="py-3 pr-4 align-top">
                    {latestRound ? (
                      <div className="rounded-lg border border-blue-900/50 bg-blue-950/30 p-2 font-mono text-[11px] text-blue-200">
                        <p className="font-semibold text-white">{latestRound.round}</p>
                        {latestRound.scheduled_at && (
                          <p className="text-[10px] text-blue-300/80 mt-0.5">
                            {new Date(latestRound.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {latestRound.location && (
                          <p className="text-[10px] text-slate-400 truncate">{latestRound.location}</p>
                        )}
                      </div>
                    ) : canSchedule ? (
                      <form action={assignInterviewRound.bind(null, id, row.application_id)} className="space-y-1 w-36">
                        <input
                          name="round"
                          placeholder="Round (GD/PI/Final)"
                          required
                          className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-white outline-none focus:border-blue-500"
                        />
                        <button type="submit" className="w-full rounded border border-blue-700 bg-blue-950/80 px-2 py-0.5 text-[10px] font-semibold text-blue-300 hover:bg-blue-900 transition-colors">
                          + Schedule
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-600 font-mono">—</span>
                    )}
                  </td>

                  {/* Placement Final CTC */}
                  <td className="py-3 pr-4 align-top font-mono text-xs">
                    {placement ? (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                        <OpsIcon name="award" size={13} className="text-amber-400" />
                        <span>Placed · {placement.final_ctc} LPA</span>
                      </span>
                    ) : row.status === "selected" && canConfirmPlacement && typedJd ? (
                      <form action={confirmPlacement.bind(null, id, row.student_id, typedJd.company_id)} className="space-y-1">
                        <input
                          name="final_ctc"
                          type="number"
                          step="0.01"
                          placeholder="CTC LPA"
                          required
                          className="w-24 rounded border border-amber-800 bg-slate-950 px-2 py-1 text-[11px] text-white outline-none focus:border-amber-500"
                        />
                        <button type="submit" className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-slate-950 hover:bg-amber-500">
                          Confirm
                        </button>
                      </form>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>

                  {/* Private Notes */}
                  {canSeePrivateNotes && (
                    <td className="py-3 pr-3 align-top">
                      <details className="group">
                        <summary className="cursor-pointer font-mono text-[11px] text-slate-400 hover:text-amber-300 transition-colors">
                          {notes.length} note{notes.length === 1 ? "" : "s"}
                        </summary>
                        <div className="mt-1.5 max-w-[200px] space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-2 text-[11px]">
                          {notes.map((note) => (
                            <p key={note.id} className="text-slate-300 border-b border-slate-850 pb-1 last:border-0">
                              {note.note_text}
                            </p>
                          ))}
                          <form action={addPrivateNote.bind(null, id, row.application_id)} className="space-y-1 pt-1">
                            <textarea
                              name="note_text"
                              rows={2}
                              placeholder="Add private note..."
                              required
                              className="w-full rounded border border-slate-700 bg-slate-900 p-1 text-[10px] text-white outline-none focus:border-blue-500"
                            />
                            <button type="submit" className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200 hover:bg-slate-700">
                              Save
                            </button>
                          </form>
                        </div>
                      </details>
                    </td>
                  )}

                  {/* Actions Column */}
                  <td className="py-3 pr-4 align-top text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {ACTIONS.map((nextStatus) => (
                        <form key={nextStatus} action={updateApplicationStatus.bind(null, id, row.application_id, nextStatus)}>
                          <button
                            type="submit"
                            disabled={row.status === nextStatus}
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize transition-all disabled:opacity-30 ${
                              nextStatus === "shortlisted"
                                ? "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60"
                                : nextStatus === "interview"
                                ? "border-blue-800 bg-blue-950/40 text-blue-300 hover:bg-blue-900/60"
                                : nextStatus === "selected"
                                ? "border-amber-800 bg-amber-950/40 text-amber-300 hover:bg-amber-900/60"
                                : "border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white"
                            }`}
                          >
                            {nextStatus}
                          </button>
                        </form>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canSeePrivateNotes ? 12 : 11} className="py-12 text-center text-slate-500">
                  <OpsIcon name="search" size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-slate-400">No applicants match active filters.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
