#!/usr/bin/env node
// Bootstrap / Reset Admin user account
// Usage: npm run admin:bootstrap -- <email> <password> [name]

import { createClient } from "@supabase/supabase-js";

const [, , rawEmail, rawPassword, rawName] = process.argv;
const email = (rawEmail ?? "").trim().toLowerCase();
const password = rawPassword ?? "";
const name = rawName ?? "Placement Admin";

if (!email || !password) {
  console.error("Usage: npm run admin:bootstrap -- <email> <password> [name]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const instituteSlug = process.env.NEXT_PUBLIC_INSTITUTE_SLUG;

if (!url || !serviceKey || !instituteSlug) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_INSTITUTE_SLUG — check .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: institute, error: instituteError } = await supabase
    .from("institutes")
    .select("id")
    .eq("slug", instituteSlug)
    .single();

  if (instituteError || !institute) {
    throw instituteError ?? new Error(`Institute '${instituteSlug}' not found`);
  }

  // Check auth user
  const { data: userList, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existingAuthUser = userList.users.find(
    (u) => u.email?.toLowerCase() === email,
  );

  let authUserId = existingAuthUser?.id;

  if (existingAuthUser) {
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      existingAuthUser.id,
      { password, email_confirm: true },
    );
    if (updateAuthError) throw updateAuthError;
    console.log(`Updated auth credentials for ${email}`);
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError ?? new Error("Auth user creation failed");
    authUserId = created.user.id;
    console.log(`Created auth user for ${email}`);
  }

  // Ensure public.users row
  const { data: existingUserRow } = await supabase
    .from("users")
    .select("id")
    .eq("institute_id", institute.id)
    .eq("email", email)
    .maybeSingle();

  let userDbId = existingUserRow?.id;

  if (!existingUserRow) {
    const { data: newUserRow, error: userError } = await supabase
      .from("users")
      .insert({
        institute_id: institute.id,
        auth_user_id: authUserId,
        name,
        email,
        status: "active",
      })
      .select("id")
      .single();
    if (userError || !newUserRow) throw userError ?? new Error("Users row creation failed");
    userDbId = newUserRow.id;
    console.log(`Created public.users row for ${email}`);
  } else {
    const { error: updateUserError } = await supabase
      .from("users")
      .update({
        auth_user_id: authUserId,
        status: "active",
        name: name || undefined,
      })
      .eq("id", existingUserRow.id);
    if (updateUserError) throw updateUserError;
    console.log(`Updated public.users row for ${email}`);
  }

  // Ensure Admin role
  const { data: adminRole, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .is("institute_id", null)
    .eq("name", "Admin")
    .single();

  if (roleError || !adminRole) throw roleError ?? new Error("Admin role not found");

  const { data: existingRole } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userDbId)
    .eq("role_id", adminRole.id)
    .maybeSingle();

  if (!existingRole) {
    const { error: assignError } = await supabase
      .from("user_roles")
      .insert({ user_id: userDbId, role_id: adminRole.id });
    if (assignError) throw assignError;
    console.log(`Assigned Admin role to ${email}`);
  }

  console.log(`\n✅ Admin account ready:`);
  console.log(`   Email:    ${email}`);
  console.log(`   Role:     Admin`);
  console.log(`   Status:   active`);
  console.log(`   Institute: ${instituteSlug}\n`);
}

main().catch((err) => {
  console.error("Bootstrap failed:", err.message ?? err);
  process.exit(1);
});
