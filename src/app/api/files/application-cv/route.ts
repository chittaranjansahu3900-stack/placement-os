import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { PLACEMENT_FILES_BUCKET } from "@/lib/placement-files";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const applicationId = new URL(request.url).searchParams.get("application") ?? "";
  if (!applicationId) return NextResponse.json({ error: "Application is required" }, { status: 400 });

  // The browser-scoped query is the authorization boundary: it proves this
  // caller can see the application. There is deliberately no shortlist-status
  // condition before fetching the original unredacted file path.
  const supabase = await createClient();
  const { data: application } = await supabase
    .from("applications")
    .select("cv_document_id")
    .eq("id", applicationId)
    .single();
  if (!application?.cv_document_id) {
    return NextResponse.json({ error: "CV file not found or not authorized" }, { status: 404 });
  }

  const service = createServiceClient();
  const { data: document } = await service
    .from("cv_documents")
    .select("file_url")
    .eq("id", application.cv_document_id)
    .single();
  if (!document?.file_url) return NextResponse.json({ error: "No original CV file uploaded" }, { status: 404 });
  if (!document.file_url.startsWith(`${ctx.appUser.institute_id}/cv/`)) {
    return NextResponse.json({ error: "Invalid tenant file path" }, { status: 403 });
  }

  const { data, error } = await service.storage
    .from(PLACEMENT_FILES_BUCKET)
    .createSignedUrl(document.file_url, 60, { download: "candidate-cv" });
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not sign CV download" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
