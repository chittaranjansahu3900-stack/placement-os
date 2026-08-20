"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";

// Split into two precise checks rather than one requireAdmin(): the
// underlying RLS these actions run against gates on two DIFFERENT
// Permission Sets, not on role name at all — user_roles_write/users_update
// require User Management, while roles_write/role_permission_sets_write
// require Role & Permission Management (0002_rls_policies.sql). Both happen
// to be Admin-only by default, but a custom role built on just one of them
// (a supported scenario per Section 7.1 — "Admin can also assign extra
// Permission Sets to an individual user directly, independent of role")
// should be able to do exactly the half that permission covers, not get
// redirected because they aren't literally named "Admin."
async function requirePermission(permissionName: string) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has(permissionName)) redirect("/dashboard");
  return ctx;
}

// Section 7.5 user lifecycle: Approval. There's no distinct "rejected"
// value in user_status (pending/active/deactivated, Section 5) — reject
// maps to 'deactivated', the closest terminal state the schema has.
export async function approveUser(userId: string) {
  await requirePermission("User Management");
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ status: "active" }).eq("id", userId);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await logAudit("user.approved", "user", userId, {});
  revalidatePath("/admin/users");
}

export async function rejectUser(userId: string) {
  await requirePermission("User Management");
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ status: "deactivated" }).eq("id", userId);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await logAudit("user.rejected", "user", userId, {});
  revalidatePath("/admin/users");
}

export async function deactivateUser(userId: string) {
  await requirePermission("User Management");
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ status: "deactivated" }).eq("id", userId);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await logAudit("user.deactivated", "user", userId, {});
  revalidatePath("/admin/users");
}

export async function reactivateUser(userId: string) {
  await requirePermission("User Management");
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ status: "active" }).eq("id", userId);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await logAudit("user.reactivated", "user", userId, {});
  revalidatePath("/admin/users");
}

export async function assignRole(userId: string, formData: FormData) {
  await requirePermission("User Management");
  const roleId = String(formData.get("role_id") ?? "");
  if (!roleId) redirect(`/admin/users?error=${encodeURIComponent("Choose a role")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("user_roles").insert({ user_id: userId, role_id: roleId });
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);

  await logAudit("user.role_assigned", "user", userId, { role_id: roleId });
  revalidatePath("/admin/users");
}

export async function removeRole(userId: string, roleId: string) {
  await requirePermission("User Management");
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role_id", roleId);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);

  await logAudit("user.role_removed", "user", userId, { role_id: roleId });
  revalidatePath("/admin/users");
}

export async function assignPermissionSet(userId: string, formData: FormData) {
  await requirePermission("User Management");
  const permissionSetId = String(formData.get("permission_set_id") ?? "");
  if (!permissionSetId) redirect(`/admin/users?error=${encodeURIComponent("Choose a Permission Set")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("user_permission_sets").insert({
    user_id: userId,
    permission_set_id: permissionSetId,
  });
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await logAudit("user.permission_set_assigned", "user", userId, { permission_set_id: permissionSetId });
  revalidatePath("/admin/users");
}

export async function removePermissionSet(userId: string, permissionSetId: string) {
  await requirePermission("User Management");
  const supabase = await createClient();
  const { error } = await supabase.from("user_permission_sets").delete().eq("user_id", userId).eq("permission_set_id", permissionSetId);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  await logAudit("user.permission_set_removed", "user", userId, { permission_set_id: permissionSetId });
  revalidatePath("/admin/users");
}

// Section 6.8 / Section 7.1: custom Role = clone an existing Role's default
// Permission Set bundle, then add/remove sets. This builds the clone +
// starting bundle in one step (the "clone from" selection); editing an
// existing custom role's bundle afterward would be a separate action —
// not built yet, see README.
export async function createCustomRole(formData: FormData) {
  const ctx = await requirePermission("Role & Permission Management");

  const name = String(formData.get("name") ?? "").trim();
  const cloneFromRoleId = String(formData.get("clone_from_role_id") ?? "") || null;
  const permissionSetIds = formData.getAll("permission_set_ids").map(String);

  if (!name) {
    redirect(`/admin/roles?error=${encodeURIComponent("Role name is required")}`);
  }

  const supabase = await createClient();
  const { data: newRole, error: roleError } = await supabase
    .from("roles")
    .insert({
      institute_id: ctx.appUser.institute_id,
      name,
      is_base_role: false,
      cloned_from_role_id: cloneFromRoleId,
    })
    .select("id")
    .single();

  if (roleError || !newRole) {
    redirect(`/admin/roles?error=${encodeURIComponent(roleError?.message ?? "Could not create role")}`);
  }

  if (permissionSetIds.length > 0) {
    const { error: bundleError } = await supabase
      .from("role_permission_sets")
      .insert(permissionSetIds.map((permission_set_id) => ({ role_id: newRole!.id, permission_set_id })));
    if (bundleError) {
      redirect(`/admin/roles?error=${encodeURIComponent(bundleError.message)}`);
    }
  }

  await logAudit("role.created", "role", newRole!.id, { name, cloned_from_role_id: cloneFromRoleId });
  revalidatePath("/admin/roles");
}

export async function updateCustomRole(roleId: string, formData: FormData) {
  await requirePermission("Role & Permission Management");
  const name = String(formData.get("name") ?? "").trim();
  const permissionSetIds = [...new Set(formData.getAll("permission_set_ids").map(String).filter(Boolean))];
  if (!name) redirect(`/admin/roles?error=${encodeURIComponent("Role name is required")}`);

  const supabase = await createClient();
  const { data: role, error: roleLookupError } = await supabase.from("roles").select("id, is_base_role, institute_id").eq("id", roleId).single();
  if (roleLookupError || !role || role.is_base_role) {
    redirect(`/admin/roles?error=${encodeURIComponent("Only an institute custom role can be edited")}`);
  }

  const { error: updateError } = await supabase.from("roles").update({ name }).eq("id", roleId);
  if (updateError) redirect(`/admin/roles?error=${encodeURIComponent(updateError.message)}`);

  const { error: deleteError } = await supabase.from("role_permission_sets").delete().eq("role_id", roleId);
  if (deleteError) redirect(`/admin/roles?error=${encodeURIComponent(deleteError.message)}`);
  if (permissionSetIds.length > 0) {
    const { error: insertError } = await supabase.from("role_permission_sets").insert(permissionSetIds.map((permission_set_id) => ({ role_id: roleId, permission_set_id })));
    if (insertError) redirect(`/admin/roles?error=${encodeURIComponent(insertError.message)}`);
  }

  await logAudit("role.updated", "role", roleId, { name, permission_set_ids: permissionSetIds });
  revalidatePath("/admin/roles");
}

export async function createBatch(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");
  const name = String(formData.get("name") ?? "").trim();
  const startsOn = String(formData.get("starts_on") ?? "") || null;
  const endsOn = String(formData.get("ends_on") ?? "") || null;
  if (!name) redirect(`/admin/roster?error=${encodeURIComponent("Batch name is required")}`);
  if (startsOn && endsOn && startsOn > endsOn) redirect(`/admin/roster?error=${encodeURIComponent("End date must be on or after start date")}`);

  const supabase = await createClient();
  const { error } = await supabase.from("batches").insert({ institute_id: ctx.appUser.institute_id, name, starts_on: startsOn, ends_on: endsOn, is_active: true });
  if (error) redirect(`/admin/roster?error=${encodeURIComponent(error.message)}`);
  await logAudit("batch.created", "batch", null, { name, starts_on: startsOn, ends_on: endsOn });
  revalidatePath("/admin/roster");
}

export async function setBatchActive(batchId: string, active: boolean) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");
  const supabase = await createClient();
  const { error } = await supabase.from("batches").update({ is_active: active }).eq("id", batchId);
  if (error) redirect(`/admin/roster?error=${encodeURIComponent(error.message)}`);
  await logAudit(active ? "batch.activated" : "batch.archived", "batch", batchId, {});
  revalidatePath("/admin/roster");
}
