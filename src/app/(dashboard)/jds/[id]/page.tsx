import Link from "next/link";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { advanceJdStatus, submitJdForSpcReview } from "@/app/actions/jds";
import { OpsIcon } from "@/components/ops-icon";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import type { Jd, JdStatus } from "@/types/domain";
import type { NotificationDatabase } from "@/types/notification-database";

type JdWithCompany = Jd & { companies: { name: string } | null };

const NEXT_STATUSES: Partial<Record<JdStatus, { status: JdStatus; label: string }[]>> = {
  published: [
    { status: "applications_closed", label: "Close Applications" },
    { status: "closed", label: "Close JD Drive" },
  ],
  applications_closed: [{ status: "shortlisting", label: "Move to Shortlisting Phase" }],
  shortlisting: [{ status: "closed", label: "Finalize & Close Drive" }],
};

export default async function JdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const [baseClient, ctx] = await Promise.all([createClient(), getCurrentUserContext()]);
  const supabase = baseClient as unknown as SupabaseClient<NotificationDatabase>;
  const canManageEligibility = !!ctx && ctx.permissionNames.has("Student Data - Full");
  const canSubmitForReview = !!ctx && ctx.permissionNames.has("JD Management");
  const canReleaseToBatch = !!ctx && ctx.permissionNames.has("Shortlist Oversight");

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
  const [{ data: deliveryJobs }, { data: jdNotifications }] = await Promise.all([
    supabase
      .from("notification_jobs")
      .select("status")
      .eq("kind", "jd_published")
      .contains("tags", { jd_id: id }),
    supabase.from("jd_notifications").select("opened_at").eq("jd_id", id),
  ]);
  const deliveryCounts = (deliveryJobs ?? []).reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
  const openedCount = (jdNotifications ?? []).filter((notification) => notification.opened_at).length;

  const submitForReviewWithId = submitJdForSpcReview.bind(null, id);
  const isAwaitingSpcReview = typedJd.status === "draft" && Boolean(typedJd.spc_review_submitted_at);
  const nextSteps = NEXT_STATUSES[typedJd.status] ?? [];

  return (
    <div className="max-w-4xl space-y-7">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <Link href="/jds" className="hover:text-white flex items-center gap-1 transition-colors">
            <OpsIcon name="briefcase" size={13} />
            <span>Job Descriptions</span>
          </Link>
          <span>/</span>
          <span className="text-slate-200">{typedJd.companies?.name ?? "Company"}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <span>{typedJd.role_title}</span>
              {typedJd.grade && (
                <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs text-slate-300 border border-slate-700">
                  {typedJd.grade}
                </span>
              )}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Corporate Partner: <strong className="text-slate-200 font-semibold">{typedJd.companies?.name ?? "Unknown"}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={isAwaitingSpcReview ? "pending_spc_review" : typedJd.status} size="md" />
            <Link
              href={`/jds/${id}/applicants`}
              className="ops-button-primary"
            >
              <OpsIcon name="users" size={13} />
              <span>Applicants Matrix</span>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2.5 rounded-lg border border-blue-800/80 bg-blue-950/70 p-3.5 text-xs text-blue-200 shadow-sm">
          <OpsIcon name="check" size={15} className="text-blue-400 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {isAwaitingSpcReview && (
        <div className="flex items-start gap-3.5 rounded-lg border border-amber-800/80 bg-amber-950/40 p-4 text-xs text-amber-100 shadow-sm">
          <OpsIcon name="check-shield" size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-200">Awaiting SPC Release Authorization</p>
            <p className="mt-1 text-amber-200/90 leading-relaxed">
              Students cannot see or apply to this opportunity yet. SPC may review the details, optionally select an earlier deadline, and release the drive to the assigned batch.
            </p>
          </div>
        </div>
      )}

      {/* Telemetry Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Eligible Candidates"
          value={eligibleCount ?? "—"}
          secondary="Cohort members qualifying criteria"
          icon="user-check"
          highlight="emerald"
        />
        <StatCard
          label="Total CTC Package"
          value={typedJd.ctc_total != null ? `${typedJd.ctc_total} LPA` : "—"}
          secondary={`Fixed: ${typedJd.ctc_fixed ?? "—"} LPA · Var: ${typedJd.ctc_variable ?? "—"} LPA`}
          icon="award"
          highlight="gold"
        />
      </div>

      {deliveryJobs && deliveryJobs.length > 0 && (
        <section className="rounded-lg border border-slate-750 bg-slate-900/90 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-blue-300">
            <OpsIcon name="mail" size={14} className="text-blue-400" />
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-blue-200">
              JD Notification Delivery Queue
            </h2>
          </div>
          <p className="mt-2 font-mono text-xs text-slate-300">
            {Object.entries(deliveryCounts)
              .map(([status, count]) => `${status}: ${count}`)
              .join(" · ")}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            Opened: {openedCount}. Server notifications send through the configured delivery service.
          </p>
        </section>
      )}

      {/* Structured Specification Grid */}
      <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-6 space-y-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
            <OpsIcon name="file-text" size={14} className="text-blue-400" />
            <span>Role Specifications &amp; Eligibility Filter</span>
          </h2>
          {canManageEligibility && (
            <Link
              href={`/jds/${id}/eligibility`}
              className="font-mono text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              <OpsIcon name="shield" size={12} />
              <span>Manage Overrides</span>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs font-mono">
          <div>
            <p className="text-slate-400 uppercase text-[10px]">Apply By Deadline</p>
            <p className="mt-1 text-white font-semibold">{new Date(typedJd.apply_by_deadline).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase text-[10px]">Locations</p>
            <p className="mt-1 text-white font-semibold font-sans">{typedJd.locations.join(", ") || "Any Location"}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase text-[10px]">One-Offer Rule</p>
            <p className="mt-1 text-white font-semibold">{typedJd.unplaced_only ? "Unplaced Only" : "Open to All"}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase text-[10px]">Min CGPA Cutoff</p>
            <p className="mt-1 text-amber-300 font-bold text-sm">{typedJd.min_cgpa ?? "No cutoff"}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase text-[10px]">Max Backlogs Allowed</p>
            <p className="mt-1 text-white font-semibold">{typedJd.max_backlog ?? 0}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase text-[10px]">Open Positions</p>
            <p className="mt-1 text-white font-semibold">{typedJd.open_positions ?? "Undisclosed"}</p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 grid sm:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-mono text-slate-400 uppercase text-[10px]">Eligible Academic Branches</p>
            <p className="mt-1 text-slate-200 font-medium">{typedJd.eligible_branches.join(", ") || "All Branches Qualified"}</p>
          </div>
          <div>
            <p className="font-mono text-slate-400 uppercase text-[10px]">Eligible Specializations</p>
            <p className="mt-1 text-slate-200 font-medium">{typedJd.eligible_specializations.join(", ") || "All Specializations Qualified"}</p>
          </div>
        </div>
      </div>

      {/* Lifecycle Actions */}
      <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold text-white font-mono uppercase tracking-wider">Lifecycle Progression Control</p>
          <p className="text-xs text-slate-400 mt-0.5">Advance hiring phase per Section 4.1 protocol.</p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {typedJd.status === "draft" && !isAwaitingSpcReview && canSubmitForReview && (
            <form action={submitForReviewWithId}>
              <button
                type="submit"
                className="ops-button-primary"
              >
                <OpsIcon name="check" size={13} />
                <span>Submit to SPC for Release</span>
              </button>
            </form>
          )}
          {isAwaitingSpcReview && canReleaseToBatch && (
            <Link href="/spc" className="ops-button-primary">
              <OpsIcon name="arrow-right" size={13} />
              <span>Open SPC Release Queue</span>
            </Link>
          )}
          {nextSteps.map((step) => (
            <form key={step.status} action={advanceJdStatus.bind(null, id, step.status)}>
              <button
                type="submit"
                className="ops-button-secondary"
              >
                <span>{step.label}</span>
                <OpsIcon name="arrow-right" size={12} />
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
