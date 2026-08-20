"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { ApplicationStatusValue } from "@/types/domain";

// FR-4.3/FR-4.6: recruiter moves a candidate's status. RLS
// (applications_update → 'Shortlisting (recruiter-scoped)', scoped to the
// caller's own company via jds.company_id) is the actual gate — a recruiter
// calling this for a JD that isn't theirs just gets a Postgres error back.
export async function updateApplicationStatus(
  jdId: string,
  applicationId: string,
  status: ApplicationStatusValue,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("applications")
    .update({ status })
    .eq("id", applicationId);

  if (error) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent(error.message)}`);
  }

  await logAudit("application.status_changed", "application", applicationId, { jd_id: jdId, status });

  revalidatePath(`/jds/${jdId}/applicants`);
}

const BULK_STATUSES = new Set<ApplicationStatusValue>([
  "shortlisted",
  "waitlisted",
  "rejected",
]);

// FR-4.3: one atomic RLS-gated mutation for a recruiter selection. The RPC is
// security invoker, so this action does not expand the caller's access.
export async function bulkUpdateApplicationStatus(jdId: string, formData: FormData) {
  const applicationIds = [
    ...new Set(
      formData
        .getAll("application_ids")
        .map((value) => String(value))
        .filter(Boolean),
    ),
  ].slice(0, 500);
  const status = String(formData.get("status") ?? "") as ApplicationStatusValue;
  const roundLabel = String(formData.get("round_label") ?? "").trim().slice(0, 100) || null;

  if (applicationIds.length === 0) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent("Select at least one applicant")}`);
  }
  if (!BULK_STATUSES.has(status)) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent("Choose a valid bulk action")}`);
  }

  const supabase = await createClient();
  const { data: affected, error } = await supabase.rpc("bulk_update_application_status", {
    p_jd_id: jdId,
    p_application_ids: applicationIds,
    p_status: status,
    p_round_label: roundLabel,
  });

  if (error) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent(error.message)}`);
  }
  if (!affected) {
    redirect(`/jds/${jdId}/applicants?error=${encodeURIComponent("No authorized applications were updated")}`);
  }

  await logAudit("application.bulk_status_changed", "jd", jdId, {
    application_ids: applicationIds,
    status,
    round_label: roundLabel,
    affected,
  });

  revalidatePath(`/jds/${jdId}/applicants`);
  redirect(
    `/jds/${jdId}/applicants?updated=${affected}&status=${encodeURIComponent(status)}`,
  );
}
