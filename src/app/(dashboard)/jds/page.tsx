import Link from "next/link";
import { cloneJdToSeason } from "@/app/actions/jds";
import { createClient } from "@/lib/supabase/server";
import type { Batch, Jd } from "@/types/domain";

type JdWithCompany = Jd & {
  companies: { name: string } | null;
  batches: Pick<Batch, "id" | "name" | "is_active" | "starts_on" | "ends_on"> | null;
};

export default async function JdsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data: jds }, { data: activeBatches }] = await Promise.all([
    supabase
      .from("jds")
      .select("*, companies(name), batches(id, name, is_active, starts_on, ends_on)")
      .order("created_at", { ascending: false }),
    supabase
      .from("batches")
      .select("id, name, starts_on, ends_on, is_active")
      .eq("is_active", true)
      .order("starts_on", { ascending: false }),
  ]);

  const rows = (jds ?? []) as unknown as JdWithCompany[];
  const currentRows = rows.filter((jd) => jd.batches?.is_active);
  const historicalRows = rows.filter((jd) => !jd.batches?.is_active);

  function jdList(items: JdWithCompany[]) {
    return (
      <ul className="divide-y divide-neutral-800">
        {items.map((jd) => (
          <li key={jd.id} className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-white">
                  {jd.companies?.name ?? "Unknown company"} — {jd.role_title}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {jd.batches?.name ?? "Unknown season"} · {jd.status.replaceAll("_", " ")} ·
                  deadline {new Date(jd.apply_by_deadline).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-3 text-xs">
                <Link href={`/jds/${jd.id}`} className="text-blue-400 hover:underline">Details</Link>
                <Link href={`/jds/${jd.id}/applicants`} className="text-blue-400 hover:underline">Applicants</Link>
              </div>
            </div>
            {activeBatches && activeBatches.length > 0 && (
              <details className="mt-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                <summary className="cursor-pointer text-xs text-neutral-300">Clone as a new-season draft</summary>
                <form action={cloneJdToSeason.bind(null, jd.id)} className="mt-3 grid gap-2 sm:grid-cols-2">
                  <select name="target_batch_id" required className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-white">
                    {activeBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                  </select>
                  <input name="apply_by_deadline" type="datetime-local" required className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-white" />
                  {jd.jd_attachment_url && (
                    <label className="flex items-center gap-2 text-xs text-neutral-400 sm:col-span-2">
                      <input type="checkbox" name="reuse_attachment" /> Reuse the same original attachment
                    </label>
                  )}
                  <button className="rounded-md border border-blue-800 px-3 py-2 text-xs text-blue-300 sm:col-span-2">Create draft from template</button>
                </form>
              </details>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">JDs</h1>
          <p className="mt-1 text-sm text-neutral-500">Current-season work plus reusable historical templates.</p>
        </div>
        <Link href="/jds/new" className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white">New JD</Link>
      </div>
      {error && <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">{error}</p>}
      <section>
        <h2 className="text-sm font-semibold text-white">Active seasons</h2>
        <div className="mt-2 rounded-md border border-neutral-800 px-4">
          {jdList(currentRows)}
          {currentRows.length === 0 && <p className="py-6 text-sm text-neutral-500">No active-season JDs yet.</p>}
        </div>
      </section>
      <section>
        <h2 className="text-sm font-semibold text-white">Historical template library</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Cloning copies JD fields only; applications, lifecycle state, notifications, and dates never carry forward.
        </p>
        <div className="mt-2 rounded-md border border-neutral-800 px-4">
          {jdList(historicalRows)}
          {historicalRows.length === 0 && <p className="py-6 text-sm text-neutral-500">No inactive-season JDs are available yet.</p>}
        </div>
      </section>
    </div>
  );
}
