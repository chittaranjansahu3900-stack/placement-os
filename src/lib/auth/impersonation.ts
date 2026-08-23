import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

// Carries a live refresh token for whichever Admin started the impersonation
// — treat this cookie with the same care as the Supabase auth cookie itself.
const COOKIE_NAME = "po_impersonation";

// Generous but not infinite, purely so the cookie doesn't vanish out from
// under a legitimately long-open tab (matches typical Supabase refresh-token
// lifetime). This is cookie hygiene, not a feature timeout — impersonation
// itself has none by design; it only ends via stopImpersonating() or logout().
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface ImpersonationStash {
  adminUserId: string; // app users.id, for audit metadata
  adminName: string; // display only, for the banner
  adminAccessToken: string;
  adminRefreshToken: string;
  targetUserId: string; // app users.id being impersonated
  startedAt: number; // epoch ms, display only
}

export async function getImpersonationStash(): Promise<ImpersonationStash | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationStash;
  } catch {
    return null;
  }
}

export async function setImpersonationStash(stash: ImpersonationStash): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(stash), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearImpersonationStash(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Mirrors getCurrentUserContext()'s permission resolution (src/lib/auth/current-user.ts)
// but for an arbitrary target user id rather than the caller — needs the
// service client since the caller's RLS-bound client has no access to
// another user's role/permission rows.
//
// Used to block impersonating anyone who is themselves admin-capable, so an
// Admin can't "become" another Admin to cover their tracks.
const ADMIN_CAPABLE_PERMISSIONS = ["Impersonate Users", "User Management", "Role & Permission Management"];

export async function targetHasAdminCapablePermission(targetUserId: string): Promise<boolean> {
  const service = createServiceClient();

  const { data: roleRows } = await service.from("user_roles").select("role_id").eq("user_id", targetUserId);
  const roleIds = (roleRows ?? []).map((r) => r.role_id).filter(Boolean);

  const [{ data: rolePermissionRows }, { data: directPermissionRows }] = await Promise.all([
    roleIds.length > 0
      ? service.from("role_permission_sets").select("permission_sets(name)").in("role_id", roleIds)
      : Promise.resolve({ data: [] }),
    service.from("user_permission_sets").select("permission_sets(name)").eq("user_id", targetUserId),
  ]);

  const permissionNames = new Set<string>();
  for (const row of (rolePermissionRows ?? []) as unknown as { permission_sets: { name: string } | null }[]) {
    if (row.permission_sets?.name) permissionNames.add(row.permission_sets.name);
  }
  for (const row of (directPermissionRows ?? []) as unknown as { permission_sets: { name: string } | null }[]) {
    if (row.permission_sets?.name) permissionNames.add(row.permission_sets.name);
  }

  return ADMIN_CAPABLE_PERMISSIONS.some((name) => permissionNames.has(name));
}
