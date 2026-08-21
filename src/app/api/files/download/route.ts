import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { PLACEMENT_FILES_BUCKET } from "@/lib/placement-files";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const url = new URL(request.url);
  const path = url.searchParams.get("path")?.trim() ?? "";
  const fileName = url.searchParams.get("name")?.replace(/[\r\n"]/g, "").slice(0, 180) || "download";
  if (!path.startsWith(`${ctx.appUser.institute_id}/`)) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PLACEMENT_FILES_BUCKET)
    .createSignedUrl(path, 60, { download: fileName });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "File not found or not authorized" }, { status: 404 });
  }
  return NextResponse.redirect(data.signedUrl);
}
