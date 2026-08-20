"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { previewCompanyCsv } from "@/lib/company-csv";

// Section 4.8 Company Pipeline. RLS (companies_insert, 0002_rls_policies.sql)
// is the real gate here — this runs on the caller's own session, not a
// service-role client, so a user without CRM/Outreach simply gets an insert
// error back, proving the policy rather than trusting this action's logic.
export async function createCompany(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const sector = String(formData.get("sector") ?? "").trim() || null;

  if (!name) {
    redirect(`/companies?error=${encodeURIComponent("Company name is required")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("companies").insert({
    institute_id: ctx!.appUser.institute_id,
    name,
    sector,
    pipeline_stage: "prospect",
    owner_user_id: ctx!.appUser.id,
  });

  if (error) {
    redirect(`/companies?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/companies");
}

export async function importCompanies(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  if (formData.get("review_confirmed") !== "true") {
    redirect(`/companies?error=${encodeURIComponent("Review the CSV before importing")}`);
  }

  const preview = previewCompanyCsv(String(formData.get("csv") ?? ""));
  if (preview.fileIssues.length || preview.validRows.length === 0) {
    redirect(`/companies?error=${encodeURIComponent(preview.fileIssues[0] ?? "No valid company rows to import")}`);
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase.from("companies").select("name");
  if (existingError) redirect(`/companies?error=${encodeURIComponent(existingError.message)}`);
  const existingNames = new Set((existing ?? []).map((row) => row.name.trim().toLocaleLowerCase()));
  const rows = preview.validRows.filter((row) => !existingNames.has(row.name.toLocaleLowerCase()));

  if (rows.length > 0) {
    const { error } = await supabase.from("companies").insert(rows.map((row) => ({
      institute_id: ctx.appUser.institute_id,
      name: row.name,
      sector: row.sector,
      pipeline_stage: row.pipeline_stage,
      owner_user_id: ctx.appUser.id,
    })));
    if (error) redirect(`/companies?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/companies");
  redirect(`/companies?imported=${rows.length}&skipped=${preview.validRows.length - rows.length + preview.invalidRows.length}`);
}
