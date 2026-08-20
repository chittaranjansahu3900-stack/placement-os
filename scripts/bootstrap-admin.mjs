#!/usr/bin/env node
// One-time bootstrap: every multi-tenant app has this chicken-and-egg problem
// — Admin accounts aren't self-service (Section 7.5 only covers
// Recruiter/SPC/BD self-signup + Student SSO auto-activation), so the very
// first Admin has to be created out-of-band. Run once per institute:
//
//   npm run admin:bootstrap -- founder@iimraipur.ac.in 'a-strong-password' 'CDPO Office'
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
// NEXT_PUBLIC_INSTITUTE_SLUG in the environment (`npm run admin:bootstrap`
// loads .env.local via Node's --env-file).

import { createClient } from "@supabase/supabase-js";

const [, , email, password, name] = process.argv;

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
    throw instituteError ?? new Error(`Institute '${instituteSlug}' not found — run the migrations first`);
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;

  const { data: userRow, error: userError } = await supabase
    .from("users")
    .insert({
      institute_id: institute.id,
      auth_user_id: created.user.id,
      name: name ?? email,
      email,
      status: "active",
    })
    .select("id")
    .single();
  if (userError) throw userError;

  const { data: adminRole, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .is("institute_id", null)
    .eq("name", "Admin")
    .single();
  if (roleError) throw roleError;

  const { error: assignError } = await supabase
    .from("user_roles")
    .insert({ user_id: userRow.id, role_id: adminRole.id });
  if (assignError) throw assignError;

  console.log(`Admin account created for ${email} at institute '${instituteSlug}'.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
