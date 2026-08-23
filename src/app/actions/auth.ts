"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// FR-1.1: "Recruiters can self-register with a work email; account
// activates only after Admin approval." This provisions the auth user and a
// `users` row with status 'pending' — nothing else. Real email verification
// (vs. the email_confirm:true shortcut below) is a follow-up once Resend is
// wired per Section 12.1; Admin approval is the actual access gate either way.
export async function signupRecruiter(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const companyName = String(formData.get("company") ?? "").trim();

  if (!name || !email || !password || !companyName) {
    redirect(`/signup?error=${encodeURIComponent("All fields are required")}`);
  }

  const instituteSlug = process.env.NEXT_PUBLIC_INSTITUTE_SLUG;
  if (!instituteSlug) {
    redirect(`/signup?error=${encodeURIComponent("Server misconfigured: no institute set")}`);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Recruiter signup is unavailable because the server-side Supabase configuration is missing.",
    );
    redirect(
      `/signup?error=${encodeURIComponent("Registration is temporarily unavailable. Please contact the CDPO administrator.")}`,
    );
  }

  const service = createServiceClient();

  const { data: institute, error: instituteError } = await service
    .from("institutes")
    .select("id")
    .eq("slug", instituteSlug)
    .single();

  if (instituteError || !institute) {
    redirect(`/signup?error=${encodeURIComponent("Unknown institute")}`);
  }

  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    redirect(`/signup?error=${encodeURIComponent(authError?.message ?? "Signup failed")}`);
  }

  // Match an existing company by name within this institute, or create one —
  // Section 4.1 doesn't require prior outreach history for a recruiter to sign up.
  const { data: existingCompany } = await service
    .from("companies")
    .select("id")
    .eq("institute_id", institute.id)
    .ilike("name", companyName)
    .maybeSingle();

  let companyId = existingCompany?.id as string | undefined;
  if (!companyId) {
    const { data: newCompany, error: companyError } = await service
      .from("companies")
      .insert({ institute_id: institute.id, name: companyName, pipeline_stage: "onboarded" })
      .select("id")
      .single();
    if (companyError || !newCompany) {
      redirect(`/signup?error=${encodeURIComponent("Could not create company record")}`);
    }
    companyId = newCompany!.id;
  }

  const { data: newUser, error: userError } = await service
    .from("users")
    .insert({
      institute_id: institute.id,
      auth_user_id: authData.user.id,
      name,
      email,
      status: "pending",
      company_id: companyId,
    })
    .select("id")
    .single();

  if (userError || !newUser) {
    redirect(`/signup?error=${encodeURIComponent("Could not create account")}`);
  }

  const { data: recruiterRole } = await service
    .from("roles")
    .select("id")
    .is("institute_id", null)
    .eq("name", "Recruiter")
    .single();

  if (recruiterRole) {
    await service.from("user_roles").insert({ user_id: newUser!.id, role_id: recruiterRole.id });
  }

  redirect(
    `/login?message=${encodeURIComponent("Account created — an Admin will review and approve it shortly.")}`,
  );
}
