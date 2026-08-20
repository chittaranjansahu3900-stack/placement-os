import { createClient } from "@/lib/supabase/server";

// FR-9.3: "Audit log of key actions: JD approvals, shortlist overrides,
// role/permission changes." Thin wrapper around log_audit_event()
// (0002_rls_policies.sql) — that function is security definer specifically
// so any authenticated action can log regardless of whether the caller
// holds Audit Log View themselves (logging and reading the log are
// different permissions; everyone who can act should be able to log the act).
//
// Deliberately swallows errors: a failed audit-log write should never block
// the real action it's describing.
export async function logAudit(
  action: string,
  targetEntity: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  try {
    const supabase = await createClient();
    await supabase.rpc("log_audit_event", {
      p_action: action,
      p_target_entity: targetEntity,
      p_target_id: targetId,
      p_metadata: metadata,
    });
  } catch {
    // Best-effort — see comment above.
  }
}
