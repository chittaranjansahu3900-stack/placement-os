"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import {
  buildInitialCvContent,
  normalizeCvContent,
  scoreCvAgainstJd,
} from "@/lib/resume";
import { normalizeCvTemplateId } from "@/lib/resume-templates";
import type { CvDocument, Student } from "@/types/domain";

function resumeRedirect(message: string, kind: "error" | "saved" = "error", cvId?: string): never {
  const query = new URLSearchParams({ [kind]: message });
  if (cvId) query.set("cv", cvId);
  redirect(`/resume/studio?${query.toString()}`);
}

async function getMyStudent() {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("*")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) resumeRedirect("No student profile is linked to this account");
  return { ctx, supabase, student: student as Student };
}

// FR-10.1/FR-10.2: create a persona-specific CV pre-filled from the roster.
export async function createCvDocument(formData: FormData) {
  const { supabase, student } = await getMyStudent();
  const personaId = String(formData.get("persona_id") ?? "").trim() || null;

  if (personaId) {
    const { data: persona } = await supabase
      .from("company_type_personas")
      .select("id")
      .eq("id", personaId)
      .maybeSingle();
    if (!persona) resumeRedirect("Choose a valid company persona");
  }

  let versionQuery = supabase
    .from("cv_documents")
    .select("version_no")
    .eq("student_id", student.id)
    .order("version_no", { ascending: false })
    .limit(1);
  versionQuery = personaId ? versionQuery.eq("persona_id", personaId) : versionQuery.is("persona_id", null);
  const { data: previous } = await versionQuery;
  const versionNo = (previous?.[0]?.version_no ?? 0) + 1;

  const { data: document, error } = await supabase
    .from("cv_documents")
    .insert({
      student_id: student.id,
      persona_id: personaId,
      version_no: versionNo,
      template_id: "placement-cell-v2",
      content: buildInitialCvContent(student),
      is_latest: true,
    })
    .select("id")
    .single();

  if (error || !document) resumeRedirect(error?.message ?? "Could not create CV");
  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  redirect(`/resume/studio?cv=${document.id}&saved=${encodeURIComponent("Profile details imported")}`);
}

// FR-10.1: clone a CV into a new immutable application-ready version.
export async function cloneCvVersion(formData: FormData) {
  const { supabase, student } = await getMyStudent();
  const documentId = String(formData.get("cv_document_id") ?? "");
  const { data: source, error: sourceError } = await supabase
    .from("cv_documents")
    .select("*")
    .eq("id", documentId)
    .eq("student_id", student.id)
    .single();
  if (sourceError || !source) resumeRedirect("CV version not found");

  let versionQuery = supabase
    .from("cv_documents")
    .select("version_no")
    .eq("student_id", student.id)
    .order("version_no", { ascending: false })
    .limit(1);
  versionQuery = source.persona_id
    ? versionQuery.eq("persona_id", source.persona_id)
    : versionQuery.is("persona_id", null);
  const { data: previous } = await versionQuery;

  const { data: clone, error } = await supabase
    .from("cv_documents")
    .insert({
      student_id: student.id,
      persona_id: source.persona_id,
      version_no: (previous?.[0]?.version_no ?? source.version_no) + 1,
      template_id: source.template_id,
      content: source.content,
      is_latest: true,
    })
    .select("id")
    .single();
  if (error || !clone) resumeRedirect(error?.message ?? "Could not create a new version", "error", documentId);

  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  redirect(`/resume/studio?cv=${clone.id}&saved=${encodeURIComponent("New version created")}`);
}

export async function saveCvDocument(formData: FormData) {
  const { supabase, student } = await getMyStudent();
  const documentId = String(formData.get("cv_document_id") ?? "");
  const raw = String(formData.get("content_json") ?? "");
  const templateId = normalizeCvTemplateId(formData.get("template_id"));

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    resumeRedirect("CV content was not valid JSON", "error", documentId);
  }
  const content = normalizeCvContent(parsed);
  if (!content.personalInfo.name) resumeRedirect("Your name is required", "error", documentId);

  const { error } = await supabase
    .from("cv_documents")
    .update({ content, template_id: templateId, is_latest: true, updated_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("student_id", student.id);
  if (error) resumeRedirect(error.message, "error", documentId);

  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  revalidatePath(`/resume/${documentId}`);
  resumeRedirect("CV saved and set as current", "saved", documentId);
}

export async function setLatestCvDocument(formData: FormData) {
  const { supabase, student } = await getMyStudent();
  const documentId = String(formData.get("cv_document_id") ?? "");
  const { error } = await supabase
    .from("cv_documents")
    .update({ is_latest: true })
    .eq("id", documentId)
    .eq("student_id", student.id);
  if (error) resumeRedirect(error.message, "error", documentId);
  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  resumeRedirect("Current application CV updated", "saved", documentId);
}

// FR-10.3: transparent keyword coverage. The supplied JD text is analyzed
// deterministically; this does not claim semantic/LLM scoring.
export async function scoreCvForJd(formData: FormData) {
  const { supabase, student } = await getMyStudent();
  const documentId = String(formData.get("cv_document_id") ?? "");
  const jdId = String(formData.get("jd_id") ?? "");
  const suppliedDescription = String(formData.get("job_description") ?? "").trim();

  const [{ data: document }, { data: jd }] = await Promise.all([
    supabase
      .from("cv_documents")
      .select("*")
      .eq("id", documentId)
      .eq("student_id", student.id)
      .single(),
    supabase
      .from("jds")
      .select("role_title, grade, locations, eligible_branches, eligible_specializations, companies(name)")
      .eq("id", jdId)
      .single(),
  ]);
  if (!document || !jd) resumeRedirect("Choose a valid CV and JD", "error", documentId);

  const companyName = (jd as unknown as { companies: { name: string } | null }).companies?.name ?? "";
  const jdText = [
    companyName,
    jd.role_title,
    jd.grade,
    ...(jd.locations ?? []),
    ...(jd.eligible_branches ?? []),
    ...(jd.eligible_specializations ?? []),
    suppliedDescription,
  ]
    .filter(Boolean)
    .join(" ");
  if (jdText.length < 20) resumeRedirect("Paste the JD description to calculate useful coverage", "error", documentId);

  const content = normalizeCvContent((document as CvDocument).content);
  const analysis = scoreCvAgainstJd(content, jdText, jdId);
  const { error } = await supabase
    .from("cv_documents")
    .update({
      content: { ...content, jdFit: analysis },
      ats_score: analysis.score,
      jd_coverage_score: analysis.score,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("student_id", student.id);
  if (error) resumeRedirect(error.message, "error", documentId);

  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  redirect(`/resume/studio?cv=${documentId}&saved=${encodeURIComponent("JD coverage updated")}`);
}

export async function addCvReviewComment(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const documentId = String(formData.get("cv_document_id") ?? "");
  const anchorSection = String(formData.get("anchor_section") ?? "").trim();
  const anchorBulletId = String(formData.get("anchor_bullet_id") ?? "").trim() || null;
  const commentText = String(formData.get("comment_text") ?? "").trim().slice(0, 4_000);
  if (!documentId || !anchorSection || !commentText) {
    redirect(`/resume/review?cv=${documentId}&error=${encodeURIComponent("Section and comment are required")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cv_review_comments").insert({
    cv_document_id: documentId,
    spc_user_id: ctx.appUser.id,
    anchor_section: anchorSection,
    anchor_bullet_id: anchorBulletId,
    comment_text: commentText,
  });
  if (error) {
    redirect(`/resume/review?cv=${documentId}&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/resume/review");
  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  redirect(`/resume/review?cv=${documentId}&saved=${encodeURIComponent("Review comment added")}`);
}

export async function updateCvReviewCommentStatus(formData: FormData) {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const commentId = String(formData.get("comment_id") ?? "");
  const documentId = String(formData.get("cv_document_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!new Set(["open", "applied", "dismissed"]).has(status)) {
    resumeRedirect("Invalid review status", "error", documentId);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cv_review_comments")
    .update({ status })
    .eq("id", commentId)
    .eq("cv_document_id", documentId);
  if (error) resumeRedirect(error.message, "error", documentId);
  revalidatePath("/resume");
  revalidatePath("/resume/studio");
  redirect(`/resume/studio?cv=${documentId}&saved=${encodeURIComponent("Review status updated")}`);
}
