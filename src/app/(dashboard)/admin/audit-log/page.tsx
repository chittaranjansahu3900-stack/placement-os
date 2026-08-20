import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { AuditLogEntry } from "@/types/domain";

// FR-9.3: "Audit log of key actions: JD approvals, shortlist overrides,
// role/permission changes — viewable by all Admins, editable/deletable by
// none." Read-only by construction: audit_log_entries has no
// update/delete RLS policy at all (0002_rls_policies.sql), and every write
// goes through log_audit_event() (src/lib/audit.ts), never a direct insert
// from this page or any other client code.
export default async function AuditLogPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("audit_log_entries")
    .select("*, users(name)")
    .order("created_at", { ascending: false })
    .limit(200);

  type EntryWithActor = AuditLogEntry & { users: { name: string } | null };
  const rows = (entries ?? []) as unknown as EntryWithActor[];

  return (
    <div className="max-w-3xl">
      <h1 className="text-lg font-semibold text-white">Audit Log</h1>
      <p className="mt-1 text-sm text-neutral-400">Most recent 200 events. Read-only.</p>

      <ul className="mt-6 divide-y divide-neutral-800">
        {rows.map((e) => (
          <li key={e.id} className="py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white">{e.action}</span>
              <span className="text-xs text-neutral-500">{new Date(e.created_at).toLocaleString()}</span>
            </div>
            <p className="text-xs text-neutral-500">
              {e.users?.name ?? "System"} · {e.target_entity}
              {e.target_id ? ` #${e.target_id.slice(0, 8)}` : ""}
            </p>
            {Object.keys(e.metadata ?? {}).length > 0 && (
              <p className="mt-0.5 font-mono text-xs text-neutral-600">{JSON.stringify(e.metadata)}</p>
            )}
          </li>
        ))}
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">No events logged yet.</p>}
      </ul>
    </div>
  );
}
