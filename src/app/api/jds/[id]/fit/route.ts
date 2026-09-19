import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import { fitAiEnabled, generateFitBrief } from "@/lib/fit/client";
import { renderPacketText, type FitInputPayload } from "@/lib/fit/prompt";
import { FitParseError, normalizeCriteria } from "@/lib/fit/schema";
import type { FitDatabase } from "@/types/fit-database";

export const runtime = "nodejs";

const MAX_PER_CALL = 25;

// POST /api/jds/:id/fit  { applicationIds?: string[] }
//
// Generates one brief per application against the JD's latest criteria version, skipping
// applications that already have a brief for that version. The packet never comes from the
// applicant directory or the packet RPC — only from get_fit_input() (0027), which strips identity
// and masked fields in SQL before anything reaches this process. Authorization is enforced inside
// that RPC and again by application_fit_briefs_insert RLS; a caller who can't write the brief
// gets a Postgres error, not a silent success.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!fitAiEnabled()) {
    return NextResponse.json({ error: "Fit briefs are disabled by the administrator" }, { status: 503 });
  }
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!ctx.permissionNames.has("Shortlisting (recruiter-scoped)")) {
    return NextResponse.json({ error: "Shortlisting permission required" }, { status: 403 });
  }

  const { id: jdId } = await context.params;
  let body: { applicationIds?: unknown } = {};
  try {
    const raw = await request.text();
    if (raw.length > 20_000) throw new Error("Request is too large");
    body = raw ? (JSON.parse(raw) as typeof body) : {};
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid JSON" }, { status: 400 });
  }

  const supabase = (await createClient()) as unknown as SupabaseClient<FitDatabase>;

  const { data: criteriaRow } = await supabase
    .from("jd_fit_criteria")
    .select("id, version_no, criteria")
    .eq("jd_id", jdId)
    .order("version_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!criteriaRow) return NextResponse.json({ error: "Write fit criteria for this JD first" }, { status: 409 });
  const criteria = normalizeCriteria(criteriaRow.criteria);
  if (criteria.length === 0) return NextResponse.json({ error: "Criteria are empty" }, { status: 409 });

  const { data: jd } = await supabase.from("jds").select("role_title").eq("id", jdId).single();
  if (!jd) return NextResponse.json({ error: "JD not found" }, { status: 404 });

  // Candidate list: RLS-scoped applications for this JD, minus withdrawn, minus already-briefed.
  const { data: applications } = await supabase
    .from("applications")
    .select("id")
    .eq("jd_id", jdId)
    .is("withdrawn_at", null);
  const requested = Array.isArray(body.applicationIds)
    ? new Set(body.applicationIds.filter((v): v is string => typeof v === "string"))
    : null;
  const { data: existing } = await supabase
    .from("application_fit_briefs")
    .select("application_id")
    .eq("criteria_id", criteriaRow.id);
  const done = new Set((existing ?? []).map((r) => r.application_id));

  const targets = (applications ?? [])
    .map((a) => a.id)
    .filter((id) => !done.has(id) && (!requested || requested.has(id)))
    .slice(0, MAX_PER_CALL);

  const results: Array<{ applicationId: string; ok: boolean; verdict?: string; degraded?: boolean; error?: string }> = [];

  for (const applicationId of targets) {
    try {
      const { data: input, error: inputError } = await supabase.rpc("get_fit_input", { p_application_id: applicationId });
      if (inputError) throw new Error(inputError.message);
      if (!input) throw new Error("Not authorized to read this application");
      const payload = input as unknown as FitInputPayload;
      const packetText = renderPacketText(payload);
      const hasWorkHistory = (payload.profile?.total_work_ex_months ?? 0) > 0;

      const { brief, model } = await generateFitBrief(criteria, packetText, jd.role_title, hasWorkHistory);

      const { data: saved, error: saveError } = await supabase
        .from("application_fit_briefs")
        .insert({
          application_id: applicationId,
          criteria_id: criteriaRow.id,
          verdict: brief.verdict,
          summary: brief.summary,
          must_haves: brief.mustHaves as unknown as FitDatabase["public"]["Tables"]["application_fit_briefs"]["Row"]["must_haves"],
          nice_to_haves: brief.niceToHaves as unknown as FitDatabase["public"]["Tables"]["application_fit_briefs"]["Row"]["nice_to_haves"],
          probes: brief.probes,
          excluded: brief.excluded,
          model,
          degraded: brief.degraded,
          generated_by_user_id: ctx.appUser.id,
        })
        .select("id")
        .single();
      if (saveError || !saved) throw new Error(saveError?.message ?? "Brief was not saved");

      await logAudit("fit_brief.generated", "application_fit_brief", saved.id, {
        jd_id: jdId,
        application_id: applicationId,
        criteria_version: criteriaRow.version_no,
        verdict: brief.verdict,
        degraded: brief.degraded,
        model,
      });
      results.push({ applicationId, ok: true, verdict: brief.verdict, degraded: brief.degraded });
    } catch (error) {
      const message = error instanceof FitParseError ? `Model reply rejected: ${error.message}` : error instanceof Error ? error.message : "Failed";
      results.push({ applicationId, ok: false, error: message });
    }
  }

  return NextResponse.json({
    criteriaVersion: criteriaRow.version_no,
    generated: results.filter((r) => r.ok).length,
    skippedExisting: done.size,
    remaining: Math.max(0, (applications ?? []).length - done.size - targets.length),
    results,
  });
}
