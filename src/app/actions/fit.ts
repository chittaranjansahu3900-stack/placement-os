"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import { fitAiEnabled, interpretCriteria } from "@/lib/fit/client";
import { normalizeCriteria, type FitCriterion } from "@/lib/fit/schema";
import type { FitDatabase } from "@/types/fit-database";

// Fit criteria are versioned and immutable (0027): saving creates version N+1. Briefs are keyed
// to a criteria version, so regenerating after an edit never overwrites the evidence a decision
// was made on. RLS (jd_fit_criteria_insert → own company + Shortlisting (recruiter-scoped)) is
// the real gate; this action just shapes the payload.
export async function saveFitCriteria(jdId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const texts = formData.getAll("criterion_text").map((v) => String(v));
  const kinds = formData.getAll("criterion_kind").map((v) => String(v));
  const drafts = texts.map((text, i) => ({ id: `c${i + 1}`, text, kind: kinds[i] === "nice" ? "nice" : "must" }));
  const criteria: FitCriterion[] = normalizeCriteria(drafts);
  if (criteria.length === 0) {
    redirect(`/jds/${jdId}/fit?error=${encodeURIComponent("Write at least one criterion")}`);
  }

  if (fitAiEnabled()) {
    try {
      const interpretations = await interpretCriteria(criteria);
      for (const c of criteria) {
        if (interpretations[c.id]) c.interpretation = interpretations[c.id];
      }
    } catch {
      // Interpretations are a convenience; the criteria still save without them.
    }
  }

  const supabase = (await createClient()) as unknown as SupabaseClient<FitDatabase>;
  const { data: latest } = await supabase
    .from("jd_fit_criteria")
    .select("version_no")
    .eq("jd_id", jdId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  const version = (latest?.version_no ?? 0) + 1;
  const { data, error } = await supabase
    .from("jd_fit_criteria")
    .insert({
      jd_id: jdId,
      version_no: version,
      criteria: criteria as unknown as FitDatabase["public"]["Tables"]["jd_fit_criteria"]["Row"]["criteria"],
      created_by_user_id: ctx!.appUser.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/jds/${jdId}/fit?error=${encodeURIComponent(error?.message ?? "Criteria were not saved")}`);
  }

  await logAudit("fit_criteria.saved", "jd", jdId, { criteria_id: data.id, version, count: criteria.length });
  revalidatePath(`/jds/${jdId}/fit`);
  redirect(`/jds/${jdId}/fit?notice=${encodeURIComponent(`Criteria v${version} saved. Generate briefs to apply them.`)}`);
}

export async function submitFitFeedback(jdId: string, briefId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const accurate = String(formData.get("accurate")) === "yes";
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 1_000) || null;

  const supabase = (await createClient()) as unknown as SupabaseClient<FitDatabase>;
  const { error } = await supabase
    .from("fit_brief_feedback")
    .upsert({ brief_id: briefId, user_id: ctx!.appUser.id, accurate, reason }, { onConflict: "brief_id,user_id" });

  if (error) {
    redirect(`/jds/${jdId}/fit?brief=${briefId}&error=${encodeURIComponent(error.message)}`);
  }

  // A disagreement is the signal that matters — FR-9.3-style trail of "the model said X, the
  // recruiter said no". Agreement is logged too so the calibration count is auditable.
  await logAudit(accurate ? "fit_brief.confirmed" : "fit_brief.disputed", "application_fit_brief", briefId, {
    jd_id: jdId,
    reason,
  });
  revalidatePath(`/jds/${jdId}/fit`);
  redirect(`/jds/${jdId}/fit?brief=${briefId}&notice=${encodeURIComponent("Thanks — recorded.")}`);
}
