"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  PLACEMENT_FILES_BUCKET,
  placementFilePath,
  validatePlacementFile,
} from "@/lib/placement-files";

export async function uploadCvFile(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const documentId = String(formData.get("cv_document_id") ?? "");

  try {
    const file = validatePlacementFile(formData.get("file"));
    if (!file) throw new Error("Choose a CV file");
    const supabase = await createClient();
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("user_id", ctx.appUser.id)
      .single();
    if (!student) throw new Error("Student profile not found");

    const path = placementFilePath(ctx.appUser.institute_id, "cv", student.id, file.name);
    const { error: uploadError } = await supabase.storage
      .from(PLACEMENT_FILES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { data: updated, error: updateError } = await supabase
      .from("cv_documents")
      .update({ file_url: path, updated_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("student_id", student.id)
      .select("id")
      .single();
    if (updateError || !updated) {
      await supabase.storage.from(PLACEMENT_FILES_BUCKET).remove([path]);
      throw new Error(updateError?.message ?? "CV not found");
    }
  } catch (error) {
    redirect(`/resume?cv=${documentId}&error=${encodeURIComponent(error instanceof Error ? error.message : "Upload failed")}`);
  }

  revalidatePath("/resume");
  redirect(`/resume?cv=${documentId}&saved=${encodeURIComponent("CV file uploaded without redaction")}`);
}

export async function uploadVaultFile(companyId: string, formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  try {
    const file = validatePlacementFile(formData.get("file"));
    if (!file) throw new Error("Choose a vault file");
    const supabase = await createClient();
    const path = placementFilePath(ctx.appUser.institute_id, "vault", companyId, file.name);
    const { error: uploadError } = await supabase.storage
      .from(PLACEMENT_FILES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const { error: metadataError } = await supabase.from("committee_vault_files").insert({
      institute_id: ctx.appUser.institute_id,
      company_id: companyId,
      file_path: path,
      original_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by_user_id: ctx.appUser.id,
    });
    if (metadataError) {
      await supabase.storage.from(PLACEMENT_FILES_BUCKET).remove([path]);
      throw new Error(metadataError.message);
    }
  } catch (error) {
    redirect(`/companies/${companyId}?error=${encodeURIComponent(error instanceof Error ? error.message : "Upload failed")}`);
  }

  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${companyId}?notice=${encodeURIComponent("Vault file uploaded without redaction")}`);
}
