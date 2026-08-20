import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { DefaultRecord } from "@/types/domain";

// FR-6.4: students can view their own default count and which activities are pending, read-only.
export default async function MyDefaultsPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-white">My Defaults</h1>
        <p className="mt-2 text-sm text-neutral-500">
          No student profile is linked to your account yet.
        </p>
      </div>
    );
  }

  const [{ data: summary }, { data: records }] = await Promise.all([
    supabase
      .from("student_defaults_summary")
      .select("*")
      .eq("student_id", student.id)
      .maybeSingle(),
    supabase.from("default_records").select("*").eq("student_id", student.id).order("activity_name"),
  ]);

  const rows = (records ?? []) as DefaultRecord[];

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold text-white">My Defaults</h1>
      <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
        <p className="text-sm text-neutral-400">Total defaults</p>
        <p className="text-2xl font-semibold text-white">{summary?.total_defaults ?? 0}</p>
      </div>

      <ul className="mt-6 divide-y divide-neutral-800">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <p className="text-neutral-200">{r.activity_name}</p>
              <p className="text-xs uppercase text-neutral-500">{r.activity_type}</p>
            </div>
            <span className={r.attended ? "text-emerald-400" : "text-red-400"}>
              {r.attended ? "Attended" : "Default"}
            </span>
          </li>
        ))}
        {rows.length === 0 && (
          <p className="py-6 text-sm text-neutral-500">No activity records on file.</p>
        )}
      </ul>
    </div>
  );
}
