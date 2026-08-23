"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import {
  getImpersonationStash,
  setImpersonationStash,
  clearImpersonationStash,
  targetHasAdminCapablePermission,
} from "@/lib/auth/impersonation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Real Supabase session swap, not a UI overlay — every RLS policy and
// getCurrentUserContext() call genuinely sees the target user once this
// completes (see supabase/migrations/0026_impersonate_users_permission.sql
// for why that's the design). log_audit_event() hardcodes
// actor_user_id = current_user_id(), so the "started" entry must be logged
// BEFORE the cookie swap below, while auth.uid() is still the admin.
export async function impersonateUser(userId: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Impersonate Users")) redirect("/dashboard");

  if (await getImpersonationStash()) {
    redirect(`/admin/users?error=${encodeURIComponent("Already impersonating — return to admin first")}`);
  }
  if (!UUID_PATTERN.test(userId)) {
    redirect(`/admin/users?error=${encodeURIComponent("Invalid user")}`);
  }
  if (userId === ctx.appUser.id) {
    redirect(`/admin/users?error=${encodeURIComponent("Cannot impersonate yourself")}`);
  }

  const supabase = await createClient();

  // Institute-scoped lookup via the normal RLS-bound client — a
  // cross-institute id simply comes back not-found (users_select RLS).
  const { data: target } = await supabase
    .from("users")
    .select("id, name, email, status, auth_user_id")
    .eq("id", userId)
    .maybeSingle();

  if (!target || !target.auth_user_id) {
    redirect(`/admin/users?error=${encodeURIComponent("User not found")}`);
  }
  if (target.status !== "active") {
    redirect(`/admin/users?error=${encodeURIComponent("Can only impersonate active users")}`);
  }
  if (await targetHasAdminCapablePermission(target.id)) {
    redirect(`/admin/users?error=${encodeURIComponent("Cannot impersonate an admin-capable account")}`);
  }

  const {
    data: { session: adminSession },
  } = await supabase.auth.getSession();
  if (!adminSession) {
    redirect(`/admin/users?error=${encodeURIComponent("Could not read your own session")}`);
  }

  await logAudit("user.impersonation_started", "user", target.id, { admin_user_id: ctx.appUser.id });

  const service = createServiceClient();
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: "magiclink",
    email: target.email,
  });
  if (linkError || !link) {
    redirect(`/admin/users?error=${encodeURIComponent("Could not start impersonation")}`);
  }

  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) {
    redirect(`/admin/users?error=${encodeURIComponent("Could not start impersonation")}`);
  }

  await setImpersonationStash({
    adminUserId: ctx.appUser.id,
    adminName: ctx.appUser.name,
    adminAccessToken: adminSession!.access_token,
    adminRefreshToken: adminSession!.refresh_token,
    targetUserId: target.id,
    startedAt: Date.now(),
  });

  redirect("/dashboard");
}

export async function stopImpersonating() {
  const stash = await getImpersonationStash();
  if (!stash) redirect("/dashboard");

  const supabase = await createClient();
  await supabase.auth.setSession({
    access_token: stash!.adminAccessToken,
    refresh_token: stash!.adminRefreshToken,
  });
  await clearImpersonationStash();

  // Logged AFTER restore — current_user_id() is back to the admin here.
  await logAudit("user.impersonation_ended", "user", stash!.targetUserId, {
    admin_user_id: stash!.adminUserId,
    duration_ms: Date.now() - stash!.startedAt,
  });

  redirect("/dashboard");
}
