import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { callResumeAi, resumeAiEnabled, type ResumeAiPurpose } from "@/lib/resume-ai";
import { maskResumePii, unmaskResumePii } from "@/lib/resume-ai-pii";
import { normalizeCvContent } from "@/lib/resume";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const INPUT_LIMITS: Record<ResumeAiPurpose, number> = {
  writing_assist: 12_000,
  cv_import: 50_000,
  quality_review: 40_000,
};
const PURPOSES = new Set<ResumeAiPurpose>(["writing_assist", "cv_import", "quality_review"]);

export async function POST(request: Request) {
  if (!resumeAiEnabled()) {
    return NextResponse.json({ error: "Resume AI is disabled by the administrator" }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 65_000) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }

  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let body: { purpose?: string; input?: string; instruction?: string; cvDocumentId?: string };
  try {
    const rawBody = await request.text();
    if (rawBody.length > 65_000) throw new Error("Request is too large");
    body = JSON.parse(rawBody) as typeof body;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid JSON request" },
      { status: 400 },
    );
  }

  const purpose = body.purpose as ResumeAiPurpose;
  const input = body.input?.trim() ?? "";
  const instruction = body.instruction?.trim().slice(0, 1_000);
  if (!PURPOSES.has(purpose)) return NextResponse.json({ error: "Invalid AI purpose" }, { status: 400 });
  if (!input || input.length > INPUT_LIMITS[purpose]) {
    return NextResponse.json(
      { error: `Input must be between 1 and ${INPUT_LIMITS[purpose].toLocaleString()} characters` },
      { status: 413 },
    );
  }

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, roll_no, name, personal_email, phone")
    .eq("user_id", ctx.appUser.id)
    .single();
  if (!student) return NextResponse.json({ error: "Student profile not found" }, { status: 403 });

  let documentPii: string[] = [];
  if (body.cvDocumentId) {
    const { data: document } = await supabase
      .from("cv_documents")
      .select("content")
      .eq("id", body.cvDocumentId)
      .eq("student_id", student.id)
      .single();
    if (!document) return NextResponse.json({ error: "CV not found" }, { status: 404 });
    const personal = normalizeCvContent(document.content).personalInfo;
    documentPii = [personal.name, personal.email, personal.phone, personal.linkedin, personal.location];
  }

  const masked = maskResumePii(input, [
    student.roll_no,
    student.name,
    student.personal_email,
    student.phone,
    ctx.appUser.name,
    ctx.appUser.email,
    ...documentPii,
  ]);

  try {
    const result = await callResumeAi(purpose, masked.maskedText, instruction);
    return NextResponse.json({
      output: unmaskResumePii(result.output, masked.replacements).slice(0, 60_000),
      provider: result.provider,
      model: result.model,
      piiMaskedCount: masked.replacements.size,
    });
  } catch (error) {
    console.error("Resume AI provider request failed", {
      purpose,
      message: error instanceof Error ? error.message : "Unknown provider error",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI provider request failed" },
      { status: 502 },
    );
  }
}
