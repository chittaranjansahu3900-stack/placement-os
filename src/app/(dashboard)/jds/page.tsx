import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Jd } from "@/types/domain";

type JdWithCompany = Jd & { companies: { name: string } | null };

// RLS (jds_select) already scopes this to "my company's JDs" for a
// Recruiter and "everything in the institute" for Admin/SPC — no app-layer
// filtering needed.
export default async function JdsPage() {
  const supabase = await createClient();
  const { data: jds } = await supabase
    .from("jds")
    .select("*, companies(name)")
    .order("created_at", { ascending: false });

  const rows = (jds ?? []) as JdWithCompany[];

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-white">JDs</h1>
      <ul className="mt-6 divide-y divide-neutral-800">
        {rows.map((jd) => (
          <li key={jd.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm text-white">
                {jd.companies?.name ?? "Unknown company"} — {jd.role_title}
              </p>
              <p className="text-xs text-neutral-500">{jd.status}</p>
            </div>
            <div className="flex gap-3 text-xs">
              <Link href={`/jds/${jd.id}`} className="text-blue-400 hover:underline">
                Details
              </Link>
              <Link href={`/jds/${jd.id}/applicants`} className="text-blue-400 hover:underline">
                Applicants
              </Link>
            </div>
          </li>
        ))}
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">No JDs yet.</p>}
      </ul>
    </div>
  );
}
