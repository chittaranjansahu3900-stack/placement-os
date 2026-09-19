import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { OpsIcon } from "@/components/shared/ops-icon";
import { FORMAT_SIZE, type PosterAudience, type PosterFormat, type PosterOccasion } from "@/lib/profile/snapshot";
import type { Batch } from "@/types/domain";

const AUDIENCES: Array<{ id: PosterAudience; label: string }> = [
  { id: "general", label: "All recruiters" },
  { id: "finance", label: "Finance / BFSI" },
  { id: "consulting", label: "Consulting" },
  { id: "technology", label: "Technology / Product" },
  { id: "marketing", label: "Sales & Marketing" },
  { id: "operations", label: "Operations / Core" },
];
const OCCASIONS: Array<{ id: PosterOccasion; label: string }> = [
  { id: "final_placements", label: "Invitation — Final placements" },
  { id: "summer_placements", label: "Invitation — Summer placements" },
  { id: "placement_report", label: "Placement statistics report" },
];

export default async function BatchProfileBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; baseline?: string; audience?: string; occasion?: string; format?: string; ai?: string }>;
}) {
  const q = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx || !(ctx.permissionNames.has("Reports & Export") || ctx.permissionNames.has("Reports - View Only"))) redirect("/dashboard");

  const supabase = await createClient();
  const { data: batches } = await supabase.from("batches").select("*").order("starts_on", { ascending: false });
  const rows = (batches ?? []) as Batch[];
  const batch = rows.find((b) => b.id === q.batch) ?? rows.find((b) => b.is_active) ?? rows[0];
  const baseline = rows.find((b) => b.id === q.baseline) ?? rows.find((b) => b.id !== batch?.id);
  const audience = (AUDIENCES.some((a) => a.id === q.audience) ? q.audience : "general") as PosterAudience;
  const occasion = (OCCASIONS.some((o) => o.id === q.occasion) ? q.occasion : "final_placements") as PosterOccasion;
  const format = (q.format && q.format in FORMAT_SIZE ? q.format : "poster_a4") as PosterFormat;
  const ai = q.ai === "1";

  const params = new URLSearchParams({ audience, occasion, format, ...(batch ? { batch: batch.id } : {}), ...(baseline ? { baseline: baseline.id } : {}), ...(ai ? { ai: "1" } : {}) });
  const previewUrl = `/api/reports/profile?${params.toString()}&out=html`;
  const { w, h } = FORMAT_SIZE[format];
  const scale = Math.min(1, 900 / w);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <p className="text-xs text-slate-400"><Link href="/reports" className="hover:text-slate-200">Reports</Link> / Batch profile builder</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Batch profile &amp; placement posters</h1>
          <p className="mt-1 text-xs text-slate-400">Every number comes from the roster and placement records for the selected batch. Change the audience and the poster re-leads with what that recruiter cares about.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/reports/profile?${params.toString()}&out=png`} className="ops-button-primary text-xs"><OpsIcon name="download" size={13} /><span>PNG</span></a>
          <a href={`/api/reports/profile?${params.toString()}&out=pdf`} className="ops-button-secondary text-xs"><OpsIcon name="download" size={13} /><span>PDF</span></a>
          <a href={previewUrl} target="_blank" rel="noreferrer" className="ops-button-secondary text-xs"><OpsIcon name="arrow-up-right" size={13} /><span>Open</span></a>
        </div>
      </div>

      <form method="get" className="ops-card grid gap-4 p-4 md:grid-cols-6">
        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Batch
          <select name="batch" defaultValue={batch?.id} className="ops-input block h-9 w-full text-xs normal-case tracking-normal">
            {rows.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Compare with
          <select name="baseline" defaultValue={baseline?.id ?? ""} className="ops-input block h-9 w-full text-xs normal-case tracking-normal">
            <option value="">—</option>
            {rows.filter((b) => b.id !== batch?.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Occasion
          <select name="occasion" defaultValue={occasion} className="ops-input block h-9 w-full text-xs normal-case tracking-normal">
            {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Audience
          <select name="audience" defaultValue={audience} className="ops-input block h-9 w-full text-xs normal-case tracking-normal">
            {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Format
          <select name="format" defaultValue={format} className="ops-input block h-9 w-full text-xs normal-case tracking-normal">
            {(Object.keys(FORMAT_SIZE) as PosterFormat[]).map((f) => <option key={f} value={f}>{FORMAT_SIZE[f].label} · {FORMAT_SIZE[f].w}×{FORMAT_SIZE[f].h}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <label className="flex h-9 items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="ai" value="1" defaultChecked={ai} className="accent-blue-500" /> Let the model choose lead &amp; order</label>
          <button type="submit" className="ops-button-secondary h-9 text-xs"><OpsIcon name="refresh" size={13} /><span>Preview</span></button>
        </div>
      </form>

      {batch ? (
        <div className="ops-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-[11px] text-slate-400">
            <span>{FORMAT_SIZE[format].label} · {w}×{h} · shown at {Math.round(scale * 100)}%</span>
            <span>{ai ? "Model-chosen lead stat and block order; numbers still from the snapshot" : "Deterministic layout"}</span>
          </div>
          <div className="overflow-auto bg-slate-950 p-4">
            <div style={{ width: w * scale, height: h * scale, overflow: "hidden", borderRadius: 8 }}>
              <iframe title="Poster preview" src={previewUrl} width={w} height={h} style={{ transform: `scale(${scale})`, transformOrigin: "top left", border: 0, background: "#fff" }} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No batches yet. Import a roster first.</p>
      )}

      <p className="text-[11px] text-slate-500">
        Recruiter logos appear only when the placement office has uploaded them against the company (Company detail → Logo). Gender split is hidden for batches under 10 students.
        Rankings and accreditations come from Admin → Institute profile.
      </p>
    </div>
  );
}
