import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { logAudit } from "@/lib/audit";
import { applyModelComposition, composeDeterministic, composeUserPrompt, COMPOSE_SYSTEM_PROMPT } from "@/lib/profile/compose";
import { brandFrom, renderPosterHtml } from "@/lib/profile/render";
import { FORMAT_SIZE, type BatchProfileSnapshot, type PosterAudience, type PosterFormat, type PosterOccasion } from "@/lib/profile/snapshot";
import { fitAiEnabled } from "@/lib/fit/client";
import type { Database, Json } from "@/types/database.types";

export const runtime = "nodejs";

type ProfileDb = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      batch_profile_snapshot: { Args: { p_batch_id: string; p_baseline_batch_id?: string | null }; Returns: Json };
    };
  };
};

const AUDIENCES = new Set<PosterAudience>(["general", "finance", "consulting", "technology", "marketing", "operations"]);
const OCCASIONS = new Set<PosterOccasion>(["final_placements", "summer_placements", "placement_report"]);

// GET /api/reports/profile?batch=<uuid>&baseline=<uuid>&audience=finance&occasion=final_placements&format=linkedin_landscape&out=html|png|pdf|json&ai=1
export async function GET(request: Request) {
  const ctx = await getCurrentUserContext();
  if (!ctx) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!ctx.permissionNames.has("Reports & Export") && !ctx.permissionNames.has("Reports - View Only")) {
    return NextResponse.json({ error: "Reports permission required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const batchId = url.searchParams.get("batch");
  const baselineId = url.searchParams.get("baseline");
  const audience = (url.searchParams.get("audience") ?? "general") as PosterAudience;
  const occasion = (url.searchParams.get("occasion") ?? "final_placements") as PosterOccasion;
  const format = (url.searchParams.get("format") ?? "poster_a4") as PosterFormat;
  const out = url.searchParams.get("out") ?? "html";
  const useAi = url.searchParams.get("ai") === "1";
  if (!batchId) return NextResponse.json({ error: "batch is required" }, { status: 400 });
  if (!AUDIENCES.has(audience) || !OCCASIONS.has(occasion) || !(format in FORMAT_SIZE)) {
    return NextResponse.json({ error: "Invalid audience, occasion or format" }, { status: 400 });
  }

  const supabase = (await createClient()) as unknown as SupabaseClient<ProfileDb>;
  const { data, error } = await supabase.rpc("batch_profile_snapshot", { p_batch_id: batchId, p_baseline_batch_id: baselineId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Batch not found or not permitted" }, { status: 404 });
  const snapshot = data as unknown as BatchProfileSnapshot;

  if (out === "json") return NextResponse.json(snapshot);

  let spec = composeDeterministic(snapshot, audience, occasion, format);
  if (useAi && fitAiEnabled()) {
    try {
      const { fitModel } = await import("@/lib/fit/client");
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
      if (apiKey) {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
          body: JSON.stringify({ model: fitModel(), max_tokens: 600, temperature: 0.3, system: COMPOSE_SYSTEM_PROMPT, messages: [{ role: "user", content: composeUserPrompt(snapshot, spec) }] }),
        });
        if (res.ok) {
          const payload = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
          const text = payload.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
          spec = applyModelComposition(snapshot, spec, text);
        }
      }
    } catch {
      // Deterministic composition is always a complete fallback.
    }
  }

  // Recruiter logos: signed, short-lived URLs from the private bucket, resolved server-side.
  const logoPaths = (snapshot.placements?.top_recruiters ?? []).map((r) => r.logo_path).filter((p): p is string => !!p);
  const signed = new Map<string, string>();
  if (logoPaths.length) {
    const { data: urls } = await supabase.storage.from("placement-files").createSignedUrls(logoPaths, 600);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }
  const html = renderPosterHtml(snapshot, spec, brandFrom(snapshot), (p) => (p ? signed.get(p) ?? null : null));

  await logAudit("batch_profile.rendered", "batch", batchId, { audience, occasion, format, out, ai: useAi, blocks: spec.blocks });

  if (out === "html") {
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // PNG / PDF need Chromium. Playwright is a devDependency (screenshots); on a host without it the
  // route says so instead of failing opaquely, and HTML still works.
  try {
    const { chromium } = await import("playwright");
    const { w, h } = FORMAT_SIZE[format];
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: "networkidle" });
      const filename = `${snapshot.institute.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${occasion}-${format}`;
      if (out === "pdf") {
        const pdf = await page.pdf({ width: `${w}px`, height: `${h}px`, printBackground: true });
        return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` } });
      }
      const png = await page.screenshot({ type: "png", fullPage: false });
      return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${filename}.png"` } });
    } finally {
      await browser.close();
    }
  } catch (e) {
    return NextResponse.json({ error: `PNG/PDF rendering unavailable on this host: ${e instanceof Error ? e.message : "unknown"}. Use out=html.` }, { status: 501 });
  }
}
