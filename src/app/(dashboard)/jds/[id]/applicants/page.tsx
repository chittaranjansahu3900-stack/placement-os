import Link from "next/link";
import { bulkUpdateApplicationStatus, updateApplicationStatus } from "@/app/actions/applicants";
import { confirmPlacement } from "@/app/actions/placements";
import { assignInterviewRound } from "@/app/actions/spc";
import { addPrivateNote } from "@/app/actions/private-notes";
import { CandidatePacket } from "@/components/candidate-packet";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canViewCandidatePacket, loadCandidatePackets } from "@/lib/candidate-packets";
import { createClient } from "@/lib/supabase/server";
import type { ApplicantDirectoryRow, ApplicationPrivateNote } from "@/types/domain";

const ACTIONS = ["shortlisted", "interview", "selected", "waitlisted", "rejected"] as const;
const SCHEDULABLE_STATUSES = ["shortlisted", "interview", "waitlisted"];
const FILTER_STATUSES = ["applied", "under_review", "shortlisted", "interview", "selected", "waitlisted", "rejected"] as const;
const SORTS = ["cgpa", "name", "work_ex", "applied_at", "status"] as const;
type SortKey = (typeof SORTS)[number];

type ApplicantSearchParams = {
  error?: string;
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

// Applicant lists always come from applicant_directory, where contact fields
// are masked pre-shortlist. Full student/CV packet queries are separately
// guarded by loadCandidatePackets and by database RLS.
export default async function ApplicantsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<ApplicantSearchParams>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const [ctx, supabase] = await Promise.all([getCurrentUserContext(), createClient()]);
  // placement_records_write RLS gates on has_permission('Student Data - Full'),
  // not role name — a custom role (e.g. Senior SPC) holding that permission
  // must see this control too, not just users literally named Admin/SPC.
  const canConfirmPlacement = !!ctx && ctx.permissionNames.has("Student Data - Full");
  const canSeePrivateNotes = !!ctx && (ctx.permissionNames.has("Shortlisting (recruiter-scoped)") || ctx.permissionNames.has("Shortlist Oversight") || ctx.permissionNames.has("Student Data - Full"));

  const [{ data: jd }, { data: applicants }] = await Promise.all([
    supabase.from("jds").select("role_title, company_id, companies(name)").eq("id", id).single(),
    supabase.from("applicant_directory").select("*").eq("jd_id", id),
  ]);
  const typedJd = jd as unknown as { role_title: string; company_id: string; companies: { name: string } | null } | null;
  const allRows = (applicants ?? []) as ApplicantDirectoryRow[];
  const branches = [...new Set(allRows.map((row) => row.branch).filter((branch): branch is string => Boolean(branch)))].sort();
  const specializations = [...new Set(allRows.map((row) => row.specialization).filter((value): value is string => Boolean(value)))].sort();
  const minCgpa = numberFilter(search.min_cgpa);
  const minWorkEx = numberFilter(search.min_work_ex);
  const query = search.q?.trim().toLocaleLowerCase() ?? "";
  const sort = SORTS.includes(search.sort as SortKey) ? (search.sort as SortKey) : "cgpa";
  const direction = search.direction === "asc" ? "asc" : "desc";

  const rows = sortApplicants(allRows.filter((row) => {
    if (query && !`${row.name} ${row.roll_no}`.toLocaleLowerCase().includes(query)) return false;
    if (search.application_status && row.status !== search.application_status) return false;
    if (search.branch && row.branch !== search.branch) return false;
    if (search.specialization && row.specialization !== search.specialization) return false;
    if (minCgpa != null && (row.cgpa == null || row.cgpa < minCgpa)) return false;
    if (minWorkEx != null && row.total_work_ex_months < minWorkEx) return false;
    return true;
  }), sort, direction);

  const applicationIds = allRows.map((row) => row.application_id);
  const studentIds = allRows.map((row) => row.student_id);
  const [{ data: applicationCvRows }, { data: existingPlacements }] = await Promise.all([
    applicationIds.length ? supabase.from("applications").select("id, cv_document_id").in("id", applicationIds) : Promise.resolve({ data: [] }),
    studentIds.length ? supabase.from("placement_records").select("student_id, final_ctc").in("student_id", studentIds) : Promise.resolve({ data: [] }),
  ]);
  const cvByApplication = new Map((applicationCvRows ?? []).map((application) => [application.id, application.cv_document_id]));
  const placementByStudent = new Map((existingPlacements ?? []).map((placement) => [placement.student_id, placement]));

  // application_private_notes has no student-visible SELECT branch at all
  // (0012_codex_audit_fixes.sql) — this query simply returns nothing for a
  // student caller rather than needing an app-side filter.
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
    <div className="max-w-full">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white">{typedJd?.companies?.name ?? "Unknown company"} — {typedJd?.role_title ?? "JD"}</h1>
          <p className="mt-1 text-sm text-neutral-400">Showing {rows.length} of {allRows.length} applicants. Contact fields unmask after shortlisting.</p>
        </div>
        {packetEligibleCount > 0 && <Link href={`/jds/${id}/applicants/packets`} className="rounded-md border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-200 hover:border-neutral-500">Merged candidate packets ({packetEligibleCount})</Link>}
      </div>

      {search.error && <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{search.error}</p>}
      {search.updated && <p className="mt-4 rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">Updated {search.updated} applicant{Number(search.updated) === 1 ? "" : "s"} to {search.status}.</p>}

      <form method="get" className="mt-5 rounded-md border border-neutral-800 bg-neutral-900 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <label className="text-xs text-neutral-400 xl:col-span-2">Search name or roll number<input name="q" defaultValue={search.q} placeholder="Candidate / roll number" className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-neutral-400">Status<select name="application_status" defaultValue={search.application_status ?? ""} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm capitalize text-white"><option value="">All statuses</option>{FILTER_STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
          <label className="text-xs text-neutral-400">Branch<select name="branch" defaultValue={search.branch ?? ""} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"><option value="">All branches</option>{branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>
          <label className="text-xs text-neutral-400">Specialization<select name="specialization" defaultValue={search.specialization ?? ""} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"><option value="">All specializations</option>{specializations.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-neutral-400">Minimum CGPA<input name="min_cgpa" type="number" min="0" max="10" step="0.01" defaultValue={search.min_cgpa} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-neutral-400">Minimum work-ex (months)<input name="min_work_ex" type="number" min="0" step="1" defaultValue={search.min_work_ex} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-neutral-400">Sort by<select name="sort" defaultValue={sort} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"><option value="cgpa">CGPA</option><option value="name">Name</option><option value="work_ex">Work experience</option><option value="applied_at">Applied date</option><option value="status">Status</option></select></label>
          <label className="text-xs text-neutral-400">Direction<select name="direction" defaultValue={direction} className="mt-1 block w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
        </div>
        <div className="mt-3 flex gap-2"><button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Apply filters</button><Link href={`/jds/${id}/applicants`} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:border-neutral-500">Reset</Link></div>
      </form>

      {selectedPackets[0] && (
        <section id="candidate-packet" className="mt-6 scroll-mt-6 rounded-lg border border-blue-900 bg-blue-950/20 p-4">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-white">Candidate packet preview</h2><p className="text-xs text-neutral-400">Full profile plus the immutable CV attached when this application was submitted.</p></div><Link href={listHref(id, search)} className="text-xs text-neutral-400 hover:text-white">Close</Link></div>
          <CandidatePacket packet={selectedPackets[0]} />
        </section>
      )}

      {allRows.length > 0 && (
        <form id="bulk-applicant-actions" action={bulkUpdateApplicationStatus.bind(null, id)} className="mt-5 flex flex-wrap items-end gap-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
          <label className="text-xs text-neutral-400">Bulk action<select name="status" required className="mt-1 block rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"><option value="shortlisted">Shortlist selected</option><option value="waitlisted">Waitlist selected</option><option value="rejected">Reject selected</option></select></label>
          <label className="text-xs text-neutral-400">Round label (optional)<input name="round_label" maxLength={100} placeholder="Round 1 / GD / PI / Final" className="mt-1 block rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" /></label>
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Apply to selected</button>
          <p className="basis-full text-xs text-neutral-600">Only currently visible, checked candidates are submitted. Status and round label are committed atomically.</p>
        </form>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-xs text-neutral-500"><th className="pb-2 pr-3 font-normal">Select</th><th className="pb-2 pr-4 font-normal">Name</th><th className="pb-2 pr-4 font-normal">CGPA</th><th className="pb-2 pr-4 font-normal">Work-ex</th><th className="pb-2 pr-4 font-normal">Branch</th><th className="pb-2 pr-4 font-normal">Contact</th><th className="pb-2 pr-4 font-normal">Status</th><th className="pb-2 pr-4 font-normal">Next round</th><th className="pb-2 pr-4 font-normal">Placement</th>{canSeePrivateNotes && <th className="pb-2 pr-4 font-normal">Private notes</th>}<th className="pb-2 font-normal">Actions</th></tr></thead>
          <tbody className="divide-y divide-neutral-800">
            {rows.map((row) => {
              const latestRound = row.round_history[row.round_history.length - 1];
              const canSchedule = SCHEDULABLE_STATUSES.includes(row.status);
              const hasFullCvAccess = canViewCandidatePacket(row.status);
              const cvId = cvByApplication.get(row.application_id);
              const placement = placementByStudent.get(row.student_id);
              const notes = notesByApplication.get(row.application_id) ?? [];
              return (
                <tr key={row.application_id} className="align-top">
                  <td className="py-2 pr-3"><input type="checkbox" name="application_ids" value={row.application_id} form="bulk-applicant-actions" aria-label={`Select ${row.name}`} className="size-4 accent-blue-600" /></td>
                  <td className="py-2 pr-4 text-white">{row.roll_no} {row.name}<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"><Link href={listHref(id, search, row.application_id)} className="text-blue-400 hover:underline">View packet</Link>{hasFullCvAccess && cvId && <Link href={`/resume/${cvId}`} className="text-blue-400 hover:underline">CV only</Link>}</div></td>
                  <td className="py-2 pr-4 text-neutral-300">{row.cgpa ?? "—"}</td><td className="py-2 pr-4 text-neutral-300">{row.total_work_ex_months} mo</td><td className="py-2 pr-4 text-neutral-300">{row.branch ?? "—"}</td>
                  <td className="py-2 pr-4 text-neutral-300">{row.phone || row.personal_email ? <span>{row.phone} {row.personal_email}</span> : <span className="text-neutral-600">Masked until shortlisted</span>}</td>
                  <td className="py-2 pr-4"><span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs capitalize text-neutral-300">{row.status.replaceAll("_", " ")}</span></td>
                  <td className="py-2 pr-4 text-xs text-neutral-400">{latestRound ? <div><p className="text-neutral-200">{latestRound.round}</p>{latestRound.scheduled_at && <p>{new Date(latestRound.scheduled_at).toLocaleString()}</p>}{latestRound.location && <p>{latestRound.location}</p>}</div> : canSchedule ? <form action={assignInterviewRound.bind(null, id, row.application_id)} className="space-y-1"><input name="round" placeholder="Round (GD/PI/Final)" required className="w-full rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-white outline-none focus:border-blue-600" /><input name="scheduled_at" type="datetime-local" className="w-full rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-white outline-none focus:border-blue-600" /><input name="location" placeholder="Room/link" className="w-full rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-white outline-none focus:border-blue-600" /><button type="submit" className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300 hover:border-neutral-500">Schedule</button></form> : "—"}</td>
                  <td className="py-2 pr-4 text-xs">{placement ? <span className="text-emerald-400">Placed{placement.final_ctc != null ? ` — ${placement.final_ctc} LPA` : ""}</span> : row.status === "selected" && canConfirmPlacement && typedJd ? <form action={confirmPlacement.bind(null, id, row.student_id, typedJd.company_id)} className="space-y-1"><input name="final_ctc" type="number" step="0.01" placeholder="Final CTC" className="w-full rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-white outline-none focus:border-blue-600" /><button type="submit" className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300 hover:border-neutral-500">Confirm Placement</button></form> : <span className="text-neutral-600">—</span>}</td>
                  {canSeePrivateNotes && (
                    <td className="py-2 pr-4 text-xs">
                      <details>
                        <summary className="cursor-pointer text-neutral-400 hover:text-neutral-200">{notes.length} note{notes.length === 1 ? "" : "s"}</summary>
                        <div className="mt-1 max-w-[220px] space-y-1">
                          {notes.map((note) => <p key={note.id} className="rounded border border-neutral-800 bg-neutral-950 p-1.5 text-neutral-300">{note.note_text}</p>)}
                          <form action={addPrivateNote.bind(null, id, row.application_id)} className="space-y-1">
                            <textarea name="note_text" rows={2} placeholder="Recruiter-only note" className="w-full rounded border border-neutral-800 bg-neutral-900 px-1.5 py-1 text-white outline-none focus:border-blue-600" />
                            <button type="submit" className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300 hover:border-neutral-500">Add note</button>
                          </form>
                        </div>
                      </details>
                    </td>
                  )}
                  <td className="py-2"><div className="flex flex-wrap gap-2">{ACTIONS.map((nextStatus) => <form key={nextStatus} action={updateApplicationStatus.bind(null, id, row.application_id, nextStatus)}><button type="submit" disabled={row.status === nextStatus} className="rounded-md border border-neutral-700 px-2 py-1 text-xs capitalize text-neutral-300 hover:border-neutral-500 disabled:opacity-40">{nextStatus}</button></form>)}</div></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={canSeePrivateNotes ? 11 : 10} className="py-6 text-sm text-neutral-500">{allRows.length ? "No applicants match these filters." : "No applicants yet."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
