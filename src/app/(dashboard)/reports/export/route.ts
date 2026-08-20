import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/current-user";
import { buildPlacementCsv, normalizeReportTemplate, type PlacementExportDataset } from "@/lib/placement-export";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // Preserve the actual Permission Set boundary: SPC is view-only by default,
  // while Admin holds Reports & Export. Role names cannot distinguish them.
  if (!(await hasPermission("Reports & Export"))) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const batchId = searchParams.get("batch_id");
  if (!batchId) return NextResponse.json({ error: "batch_id is required" }, { status: 400 });

  const template = normalizeReportTemplate(searchParams.get("template"));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_placement_export_dataset", { p_batch_id: batchId });
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not build export dataset" }, { status: 400 });
  }

  const csv = buildPlacementCsv(
    data as unknown as PlacementExportDataset,
    template,
    searchParams.getAll("fields"),
    searchParams.get("include_unplaced") === "1",
  );
  const filename = `${template}-${(data as unknown as PlacementExportDataset).batch.name.replace(/[^a-z0-9_-]+/gi, "-")}.csv`;

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
