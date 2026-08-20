import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publishJd, advanceJdStatus } from "@/app/actions/jds";
import type { Jd, JdStatus } from "@/types/domain";

type JdWithCompany = Jd & { companies: { name: string } | null };

// FR-1.3: the linear lifecycle from Section 4.1 — Draft → Published →
// Applications Closed → Shortlisting → Closed, with Published → Closed as a
// direct shortcut when a separate Shortlisting phase isn't needed. Actual
// enforcement is jds_status_transition_guard (0013_jd_lifecycle.sql); this
// map only decides which button(s) to render, matching what the trigger
// will actually allow for the JD's current status.
const NEXT_STATUSES: Partial<Record<JdStatus, { status: JdStatus; label: string }[]>> = {
  published: [
    { status: "applications_closed", label: "Close Applications" },
    { status: "closed", label: "Close JD" },
  ],
  applications_closed: [{ status: "shortlisting", label: "Move to Shortlisting" }],
  shortlisting: [{ status: "closed", label: "Close JD" }],
};

// FR-1.4 "estimated eligible-student count before publish", backed by the
// eligible_student_count_for_jd() SQL function in
// 0004_settings_functions_views.sql — this page is the eligibility engine's
// only current consumer, so it's the place that proves the function works
// end to end (correct count, no PII leak to non-Admin callers).
export default async function JdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("*, companies(name)")
    .eq("id", id)
    .single();

  if (!jd) notFound();

  const typedJd = jd as unknown as JdWithCompany;

  const { data: eligibleCount } = await supabase.rpc("eligible_student_count_for_jd", {
    p_jd_id: id,
  });

  const publishWithId = publishJd.bind(null, id);
  const nextSteps = NEXT_STATUSES[typedJd.status] ?? [];

  return (
    <div className="max-w-xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">{typedJd.role_title}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {typedJd.companies?.name ?? "Unknown company"}
            {typedJd.grade ? ` · ${typedJd.grade}` : ""}
          </p>
        </div>
        <Link href={`/jds/${id}/applicants`} className="text-sm text-blue-400 hover:underline">
          View applicants
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
        <p className="text-sm text-neutral-400">Estimated eligible students</p>
        <p className="text-2xl font-semibold text-white">{eligibleCount ?? "—"}</p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-neutral-500">Status</dt>
          <dd className="capitalize text-white">
            {typedJd.status.replace("_", " ")}
            {typedJd.status === "draft" && typedJd.admin_approval_required && (
              <span className="ml-2 rounded-full border border-amber-800 px-2 py-0.5 text-xs text-amber-300">
                Needs Admin approval to publish
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">CTC (total)</dt>
          <dd className="text-white">{typedJd.ctc_total != null ? `${typedJd.ctc_total} LPA` : "—"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Locations</dt>
          <dd className="text-white">{typedJd.locations.join(", ") || "Any"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Apply by</dt>
          <dd className="text-white">{new Date(typedJd.apply_by_deadline).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Unplaced only</dt>
          <dd className="text-white">{typedJd.unplaced_only ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Open positions</dt>
          <dd className="text-white">{typedJd.open_positions ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Eligible branches</dt>
          <dd className="text-white">{typedJd.eligible_branches.join(", ") || "All"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Eligible specializations</dt>
          <dd className="text-white">{typedJd.eligible_specializations.join(", ") || "All"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Min CGPA</dt>
          <dd className="text-white">{typedJd.min_cgpa ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Max backlogs</dt>
          <dd className="text-white">{typedJd.max_backlog ?? "—"}</dd>
        </div>
      </dl>

      {typedJd.status === "draft" && (
        <form action={publishWithId} className="mt-6">
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Publish
          </button>
        </form>
      )}

      {nextSteps.length > 0 && (
        <div className="mt-6 flex gap-2">
          {nextSteps.map((step) => (
            <form key={step.status} action={advanceJdStatus.bind(null, id, step.status)}>
              <button
                type="submit"
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:border-neutral-500"
              >
                {step.label}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
