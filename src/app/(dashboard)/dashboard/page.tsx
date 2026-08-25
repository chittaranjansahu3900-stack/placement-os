import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";

type ActiveJdSummary = {
  id: string;
  role_title: string;
  status: string;
  companies: { name: string } | null;
};

type AuditSummary = {
  id: string;
  action: string;
  target_entity: string;
  created_at: string;
};

export default async function DashboardPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  if (ctx.appUser.status === "pending") {
    return (
      <div className="mx-auto mt-10 max-w-2xl">
        <div className="rounded-xl border border-amber-800/80 bg-slate-900/95 p-6 sm:p-8 shadow-xl">
          <div className="flex items-center gap-3.5 text-amber-400">
            <div className="flex size-11 items-center justify-center rounded-lg bg-amber-950/90 border border-amber-700/80 shadow-[0_0_12px_rgba(245,158,11,0.2)]">
              <OpsIcon name="shield" size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Pending CDPO Verification</h1>
              <p className="font-mono text-xs text-amber-300">Waiting on approval · Recruiter Access Queue · BRD Section 7.5</p>
            </div>
          </div>
          <div className="mt-6 space-y-3.5 text-sm text-slate-300">
            <p>
              Your recruiter account for <strong className="text-white font-semibold">{ctx.appUser.email}</strong> is registered.
            </p>
            <p className="text-slate-400 leading-relaxed text-xs sm:text-sm">
              In accordance with institute fair-hiring and placement security protocols, every corporate recruiter account undergoes verification by the Career Development &amp; Placement Office (CDPO) before candidate dossiers and applicants are unlocked.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-750 bg-slate-950/80 p-4 font-mono text-xs text-slate-300 shadow-inner">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-amber-400"></span>
            </span>
            <span>Review Status: In Active CDPO Queue · Administrator will approve shortly</span>
          </div>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const [activeJdsResult, companyCountResult, studentCountResult, placementCountResult, recentAuditsResult] = await Promise.all([
    supabase.from("jds").select("id, role_title, status, companies(name)").eq("status", "published").limit(5),
    supabase.from("companies").select("id", { count: "exact", head: true }),
    supabase.from("students").select("id", { count: "exact", head: true }),
    supabase.from("placement_records").select("id", { count: "exact", head: true }),
    supabase.from("audit_log_entries").select("id, action, target_entity, created_at").order("created_at", { ascending: false }).limit(4),
  ]);
  const activeJds = (activeJdsResult.data ?? []) as unknown as ActiveJdSummary[];
  const companyCount = companyCountResult.count ?? 0;
  const studentCount = studentCountResult.count ?? 0;
  const placementCount = placementCountResult.count ?? 0;
  const placementRate = studentCount > 0 ? `${((placementCount / studentCount) * 100).toFixed(1)}%` : "—";
  const recentAudits = (recentAuditsResult.data ?? []) as AuditSummary[];

  const isAdmin = ctx.roleNames.includes("Admin");
  const isStudent = ctx.roleNames.includes("Student");
  const isRecruiter = ctx.roleNames.includes("Recruiter");

  return (
    <div className="space-y-8">
      {/* Top Welcome & Mission Status */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Placement Operations Command
            </h1>
            <span className="rounded bg-emerald-950/90 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-400 border border-emerald-700/70 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
              LIVE COHORT
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Welcome back, <strong className="text-slate-200 font-semibold">{ctx.appUser.name}</strong> · Session role:{" "}
            <span className="font-mono font-medium text-amber-400">{ctx.roleNames.join(", ")}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <Link
              href="/jds/new"
              className="ops-button-primary"
            >
              <OpsIcon name="plus" size={14} />
              <span>Post New JD</span>
            </Link>
          )}
          {isStudent && (
            <Link
              href="/jobs"
              className="ops-button-primary"
            >
              <OpsIcon name="briefcase" size={14} />
              <span>Browse Opportunities</span>
            </Link>
          )}
          {isRecruiter && (
            <Link
              href="/jds"
              className="ops-button-primary"
            >
              <OpsIcon name="users" size={14} />
              <span>Review Applicants</span>
            </Link>
          )}
        </div>
      </div>

      {/* Primary Telemetry Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active JDs"
          value={activeJds.length}
          secondary="Open for candidate applications"
          icon="briefcase"
          highlight="emerald"
        />
        <StatCard
          label="Partner Companies"
          value={companyCount}
          secondary="In active corporate pipeline"
          icon="building"
          highlight="gold"
        />
        <StatCard
          label="Cohort Size"
          value={studentCount}
          secondary="PGP 2024–26 registered candidates"
          icon="users"
          highlight="cobalt"
        />
        <StatCard
          label="Season Placement"
          value={placementRate}
          secondary={`${placementCount} confirmed offer${placementCount === 1 ? "" : "s"}`}
          icon="chart"
          highlight="gold"
        />
      </div>

      {/* War Room Working Panes */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Active Hiring Streams */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
              <OpsIcon name="briefcase" size={15} className="text-amber-400" />
              <span>Active Placement Drives</span>
            </h2>
            <Link href="/jds" className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <span>View all drives</span>
              <OpsIcon name="arrow-right" size={12} />
            </Link>
          </div>

          <div className="divide-y divide-slate-800 rounded-lg border border-slate-750 bg-slate-900/90 shadow-sm overflow-hidden">
            {activeJds.length > 0 ? (
              activeJds.map((jd) => (
                <div key={jd.id} className="p-4 hover:bg-slate-850/60 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate">
                      <p className="font-semibold text-white text-sm truncate">
                        {jd.companies?.name ?? "Company"}
                      </p>
                      <span className="text-slate-500 font-mono text-xs">/</span>
                      <p className="text-slate-300 text-sm truncate">{jd.role_title}</p>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-400 flex items-center gap-2">
                      <OpsIcon name="map-pin" size={12} className="text-slate-500" />
                      <span>Bangalore, Hyderabad · CTC 34.0 LPA</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={jd.status} size="sm" />
                    <Link
                      href={`/jds/${jd.id}/applicants`}
                      className="ops-button-secondary text-xs py-1 px-2.5 min-h-0"
                    >
                      Applicants
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-slate-400">
                No active JDs currently published.
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Tactical Shortcuts & Audit Stream */}
        <div className="space-y-3.5">
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-slate-300">
            <OpsIcon name="terminal" size={15} className="text-emerald-400" />
            <span>Security Audit Trail</span>
          </h2>

          <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-4 divide-y divide-slate-800/80 text-xs font-mono shadow-sm">
            {recentAudits.map((audit) => (
              <div key={audit.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="text-emerald-400 font-semibold">{audit.action}</span>
                  <span className="text-slate-500">{new Date(audit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="mt-0.5 text-slate-300 text-[11px] truncate">
                  Target: {audit.target_entity}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
