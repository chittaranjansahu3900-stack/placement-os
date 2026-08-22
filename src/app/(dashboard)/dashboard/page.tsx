import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/ops-icon";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";

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
      <div className="max-w-2xl mx-auto mt-8">
        <div className="border-l-2 border-amber-500 bg-slate-900 p-6 sm:p-8">
          <div className="flex items-center gap-3 text-amber-400">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-950 border border-amber-800/60">
              <OpsIcon name="shield" size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-amber-100">Waiting on approval</h1>
              <p className="font-mono text-xs text-amber-400/80">Account Pending CDPO Verification · BRD Section 7.5</p>
            </div>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <p>
              Your recruiter account for <strong className="text-white">{ctx.appUser.email}</strong> is created and registered.
            </p>
            <p className="text-slate-400 leading-relaxed">
              In accordance with institute fair-hiring and placement security protocols, every corporate recruiter account undergoes verification by the Career Development &amp; Placement Office (CDPO) before candidate data is unlocked.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-3 border border-slate-700 bg-[#0d1928] p-4 font-mono text-xs text-slate-400">
            <span className="size-2 bg-amber-400" />
            <span>Review status: In Queue · Administrator will approve shortly</span>
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Placement Operations Command
            </h1>
            <span className="rounded-md bg-emerald-950 px-2 py-0.5 font-mono text-xs font-semibold text-emerald-400 border border-emerald-800/60">
              LIVE
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Welcome back, <strong className="text-slate-200">{ctx.appUser.name}</strong> · Logged in as{" "}
            <span className="font-mono text-amber-400">{ctx.roleNames.join(", ")}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
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
              <span>Browse Active JDs</span>
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
          secondary="Open for applications"
          icon="briefcase"
          highlight="emerald"
        />
        <StatCard
          label="Partner Companies"
          value={companyCount}
          secondary="In corporate pipeline"
          icon="building"
          highlight="gold"
        />
        <StatCard
          label="Cohort Size"
          value={studentCount}
          secondary="PGP 2024–26 cohort"
          icon="users"
          highlight="cobalt"
        />
        <StatCard
          label="Season Placement"
          value={placementRate}
          secondary={`${placementCount} confirmed placement${placementCount === 1 ? "" : "s"}`}
          icon="chart"
          highlight="gold"
        />
      </div>

      {/* War Room Working Panes */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Active Hiring Streams */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <OpsIcon name="briefcase" size={16} className="text-amber-400" />
              <span>Active Placement Drives</span>
            </h2>
            <Link href="/jds" className="text-xs font-medium text-blue-400 hover:underline flex items-center gap-1">
              <span>View all</span>
              <OpsIcon name="arrow-right" size={12} />
            </Link>
          </div>

          <div className="divide-y divide-slate-800/80 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-md overflow-hidden">
            {activeJds.map((jd) => (
              <div key={jd.id} className="p-4 hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-white text-sm">
                      {jd.companies?.name ?? "Company"}
                    </p>
                    <span className="text-slate-500 font-mono text-xs">/</span>
                    <p className="text-slate-300 text-sm">{jd.role_title}</p>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-400 flex items-center gap-2">
                    <OpsIcon name="map-pin" size={12} className="text-slate-500" />
                    <span>Bangalore, Hyderabad · CTC 34.0 LPA</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={jd.status} size="sm" />
                  <Link
                    href={`/jds/${jd.id}/applicants`}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-600 hover:text-white transition-colors"
                  >
                    Applicants
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Tactical Shortcuts & Audit Stream */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <OpsIcon name="terminal" size={16} className="text-emerald-400" />
            <span>Audit Activity Stream</span>
          </h2>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 divide-y divide-slate-800/60 text-xs font-mono">
            {recentAudits.map((audit) => (
              <div key={audit.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="text-emerald-400 font-semibold">{audit.action}</span>
                  <span>{new Date(audit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
