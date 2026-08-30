import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { withdrawApplication } from "@/app/actions/applications";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusPill } from "@/components/student/status-pill";
import { CompanyAvatar } from "@/components/student/company-avatar";
import type { Application, ApplicationStatusValue } from "@/types/domain";

type ApplicationWithJd = Application & {
  jds: { role_title: string; apply_by_deadline: string; companies: { name: string } | null } | null;
};

const COLUMNS: { status: ApplicationStatusValue; label: string; accent: string }[] = [
  { status: "applied", label: "Applied", accent: "border-t-slate-300" },
  { status: "under_review", label: "Under review", accent: "border-t-amber-400" },
  { status: "shortlisted", label: "Shortlisted", accent: "border-t-emerald-400" },
  { status: "interview", label: "Interview", accent: "border-t-blue-400" },
  { status: "selected", label: "Offers", accent: "border-t-emerald-500" },
];

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; selected?: string }>;
}) {
  const { error, selected: selectedId } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <OpsIcon name="shield" size={28} className="mx-auto mb-2 text-amber-500" />
        <h1 className="text-lg font-bold text-slate-900">Student account required</h1>
        <p className="mt-2 text-sm text-slate-500">No student profile is associated with this login. Reach out to your CDPO coordinator.</p>
      </div>
    );
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jds(role_title, apply_by_deadline, companies(name))")
    .eq("student_id", student.id)
    .order("applied_at", { ascending: false });

  const rows = (applications ?? []) as ApplicationWithJd[];
  const active = rows.filter((r) => !r.withdrawn_at && r.status !== "rejected" && r.status !== "waitlisted");
  const closed = rows.filter((r) => r.withdrawn_at || r.status === "rejected" || r.status === "waitlisted");
  const byStatus = new Map<ApplicationStatusValue, ApplicationWithJd[]>();
  for (const row of active) {
    byStatus.set(row.status, [...(byStatus.get(row.status) ?? []), row]);
  }

  const selected = rows.find((r) => r.id === selectedId) ?? active[0] ?? null;
  const canWithdraw =
    selected && !selected.withdrawn_at && selected.jds && new Date(selected.jds.apply_by_deadline) > new Date();

  const timeline = selected
    ? [
        { label: "Application submitted", at: selected.applied_at, detail: null as string | null },
        ...selected.round_history
          .slice()
          .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
          .map((r) => ({
            label: r.round,
            at: r.scheduled_at ?? r.assigned_at,
            detail: r.location,
          })),
        ...(selected.withdrawn_at ? [{ label: "Withdrawn", at: selected.withdrawn_at, detail: null }] : []),
      ]
    : [];

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My applications</h1>
        <p className="mt-1 text-sm text-slate-500">
          {rows.length} submitted · {(byStatus.get("shortlisted")?.length ?? 0) + (byStatus.get("interview")?.length ?? 0)} advancing to interview rounds
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700 shadow-sm">
          <OpsIcon name="alert-triangle" size={15} className="shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <OpsIcon name="file-text" size={28} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">You haven&apos;t submitted any applications yet.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5">
            {COLUMNS.map((col) => {
              const items = byStatus.get(col.status) ?? [];
              return (
                <div key={col.status} className="flex flex-col gap-2">
                  <div className={`flex items-center justify-between border-t-2 pt-1.5 ${col.accent}`}>
                    <span className="text-xs font-bold text-slate-700">{col.label}</span>
                    <span className="text-xs font-bold text-slate-400">{items.length}</span>
                  </div>
                  {items.length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-200 px-2 py-3 text-center text-[11px] text-slate-400">—</p>
                  )}
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/applications?selected=${item.id}`}
                      className={`rounded-lg border p-2 text-left transition-colors ${
                        selected?.id === item.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <p className="truncate text-xs font-bold text-slate-900">{item.jds?.companies?.name ?? "Company"}</p>
                      <p className="truncate text-[11px] text-slate-500">{item.jds?.role_title ?? "Role"}</p>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>

          {selected && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CompanyAvatar name={selected.jds?.companies?.name ?? "Company"} />
                  <div>
                    <h2 className="font-bold text-slate-900">
                      {selected.jds?.companies?.name ?? "Company"} · {selected.jds?.role_title ?? "Role"}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Applied {new Date(selected.applied_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <StatusPill status={selected.withdrawn_at ? "withdrawn" : selected.status} />
                  {canWithdraw && (
                    <form action={withdrawApplication}>
                      <input type="hidden" name="application_id" value={selected.id} />
                      <button type="submit" className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                        Withdraw
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-0">
                {timeline.map((step, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                      {i < timeline.length - 1 && <span className="w-px flex-1 bg-slate-200" style={{ minHeight: 22 }} />}
                    </div>
                    <div className={i < timeline.length - 1 ? "pb-4" : ""}>
                      <p className="text-sm font-semibold text-slate-900 capitalize">{step.label.replaceAll("_", " ")}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {new Date(step.at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        {step.detail ? ` · ${step.detail}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {closed.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Closed</h2>
              {closed.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 opacity-75">
                  <div className="flex items-center gap-3">
                    <CompanyAvatar name={a.jds?.companies?.name ?? "Company"} size={32} />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{a.jds?.companies?.name ?? "Company"} — {a.jds?.role_title ?? "Role"}</p>
                    </div>
                  </div>
                  <StatusPill status={a.withdrawn_at ? "withdrawn" : a.status} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
