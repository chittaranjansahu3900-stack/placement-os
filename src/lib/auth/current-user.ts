import { createClient } from "@/lib/supabase/server";
import type { AppUser } from "@/types/domain";

export interface CurrentUserContext {
  authUserId: string;
  appUser: AppUser;
  roleNames: string[];
  // Mirrors has_permission()'s own SQL logic (role-derived UNION
  // directly-assigned Permission Sets, 0002_rls_policies.sql) — unlike
  // roleNames, this DOES reflect the real authorization boundary and is
  // safe to gate UI/actions on directly. It exists specifically so a
  // custom role (e.g. "Senior SPC," cloned from SPC per Section 7.1) isn't
  // wrongly blocked by a `roleNames.includes("SPC")`-style check just
  // because it isn't literally named that — RLS itself never checks role
  // name, only granted Permission Sets, and page-level gates should match.
  permissionNames: Set<string>;
}

// UI-branching only for roleNames/permissionNames — this is NOT the
// authorization boundary. RLS policies (0002_rls_policies.sql) are the
// actual enforcement; a check against this context must never be the only
// thing standing between a user and data they shouldn't see.
export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();
  if (!appUser) return null;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role_id, roles(name)")
    .eq("user_id", appUser.id);

  const roleNames = (roleRows ?? [])
    .map((r) => (r as unknown as { roles: { name: string } | null }).roles?.name)
    .filter((n): n is string => Boolean(n));

  const roleIds = (roleRows ?? []).map((r) => r.role_id).filter(Boolean);

  const permissionNames = new Set<string>();
  const [{ data: rolePermissionRows }, { data: directPermissionRows }] = await Promise.all([
    roleIds.length > 0
      ? supabase.from("role_permission_sets").select("permission_sets(name)").in("role_id", roleIds)
      : Promise.resolve({ data: [] }),
    supabase.from("user_permission_sets").select("permission_sets(name)").eq("user_id", appUser.id),
  ]);

  for (const row of (rolePermissionRows ?? []) as unknown as { permission_sets: { name: string } | null }[]) {
    if (row.permission_sets?.name) permissionNames.add(row.permission_sets.name);
  }
  for (const row of (directPermissionRows ?? []) as unknown as { permission_sets: { name: string } | null }[]) {
    if (row.permission_sets?.name) permissionNames.add(row.permission_sets.name);
  }

  return { authUserId: user.id, appUser: appUser as AppUser, roleNames, permissionNames };
}

// Standalone RPC-based check for call sites that don't already have a
// CurrentUserContext in hand (e.g. a route handler with no other reason to
// fetch the full context) — same has_permission() function, one round trip.
// Where a ctx already exists, prefer ctx.permissionNames.has(...) instead.
export async function hasPermission(permissionName: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_permission", { perm_name: permissionName });
  return data === true;
}
