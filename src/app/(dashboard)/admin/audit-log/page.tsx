import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { OpsIcon } from "@/components/ops-icon";
import type { AuditLogEntry } from "@/types/domain";

export default async function AuditLogPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Audit Log View")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("audit_log_entries")
    .select("*, users(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  type EntryWithActor = AuditLogEntry & { users: { name: string } | null };
  const rows = (entries ?? []) as unknown as EntryWithActor[];

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-400">
            <OpsIcon name="terminal" size={14} />
            <span>Cryptographic Security Trail</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>System Audit Log</span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
              {rows.length} Events
            </span>
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            BRD Section 6.9: Immutable audit records of permissions, approvals, overrides, and administrative actions.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs font-mono text-slate-400">
          <span className="size-2 rounded-full bg-emerald-400" />
          <span>Read-Only Archive</span>
        </div>
      </div>

      {/* Log Feed */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2 mb-4">
          <OpsIcon name="layers" size={16} className="text-amber-400" />
          <span>Chronological Audit Stream</span>
        </h2>

        <div className="space-y-3 font-mono text-xs">
          {rows.map((e) => (
            <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-1.5 hover:border-slate-700 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-amber-300 font-sans text-xs">{e.action}</span>
                <span className="text-[11px] text-slate-500">
                  {new Date(e.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 text-[11px]">
                <span>Actor: <strong className="text-slate-200">{e.users?.name ?? "System Automation"}</strong></span>
                <span>·</span>
                <span>Entity: <strong className="text-blue-300">{e.target_entity}</strong></span>
                {e.target_id && (
                  <span>#{e.target_id.slice(0, 8)}</span>
                )}
              </div>

              {Object.keys(e.metadata ?? {}).length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-850 bg-[#080d17] p-2 text-[10px] text-slate-400 overflow-x-auto">
                  <code>{JSON.stringify(e.metadata)}</code>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <p className="py-12 text-center text-xs text-slate-500 font-mono">No audit events recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
