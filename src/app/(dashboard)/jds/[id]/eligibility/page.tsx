import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  excludeStudentFromJd,
  includeStudentInJd,
  removeEligibilityOverride,
} from "@/app/actions/eligibility";
import type { Jd, JdEligibilityOverride, Student } from "@/types/domain";

// FR-2.5: Admin/SPC review the eligible list and manually add/remove
// specific students before the (future) notification send. The raw
// auto-eligible count on the JD detail page (FR-1.4) is intentionally left
// untouched by this — see 0018_eligibility_overrides.sql's comment on why
// final_eligible_* is a separate function from eligible_*.
export default async function JdEligibilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.permissionNames.has("Student Data - Full")) redirect(`/jds/${id}`);

  const supabase = await createClient();

  const { data: jd } = await supabase
    .from("jds")
    .select("*, companies(name)")
    .eq("id", id)
    .single();
  const typedJd = jd as unknown as (Jd & { companies: { name: string } | null }) | null;
  if (!typedJd) redirect("/jds");

  const [{ data: finalList }, { data: overrides }, { data: batchStudents }] = await Promise.all([
    supabase.rpc("final_eligible_students_for_jd", { p_jd_id: id }),
    supabase.from("jd_eligibility_overrides").select("*").eq("jd_id", id),
    supabase.from("students").select("id, roll_no, name").eq("batch_id", typedJd.batch_id).order("roll_no"),
  ]);

  const finalRows = (finalList ?? []) as Student[];
  const overrideRows = (overrides ?? []) as JdEligibilityOverride[];
  const finalIds = new Set(finalRows.map((s) => s.id));
  const includedIds = new Set(overrideRows.filter((o) => o.override_type === "include").map((o) => o.student_id));
  const excludedOverrides = overrideRows.filter((o) => o.override_type === "exclude");

  const batchStudentRows = (batchStudents ?? []) as Pick<Student, "id" | "roll_no" | "name">[];
  const excludedStudentsById = new Map(batchStudentRows.map((s) => [s.id, s]));
  const availableToInclude = batchStudentRows.filter((s) => !finalIds.has(s.id));

  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Eligibility Overrides</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {typedJd.companies?.name ?? "Unknown company"} — {typedJd.role_title}
          </p>
        </div>
        <Link href={`/jds/${id}`} className="text-sm text-blue-400 hover:underline">
          Back to JD
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
        <p className="text-sm text-neutral-400">Final eligible count (auto + overrides)</p>
        <p className="text-2xl font-semibold text-white">{finalRows.length}</p>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-white">Eligible students</h2>
        <ul className="mt-2 divide-y divide-neutral-800 text-sm">
          {finalRows.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span className="text-white">
                {s.roll_no} {s.name}
                {includedIds.has(s.id) && (
                  <span className="ml-2 rounded-full border border-emerald-800 px-2 py-0.5 text-xs text-emerald-300">
                    Manually included
                  </span>
                )}
              </span>
              {includedIds.has(s.id) ? (
                <form action={removeEligibilityOverride.bind(null, id, s.id)}>
                  <button type="submit" className="text-xs text-red-400 hover:underline">
                    Remove override
                  </button>
                </form>
              ) : (
                <form action={excludeStudentFromJd.bind(null, id, s.id)}>
                  <button type="submit" className="text-xs text-neutral-400 hover:text-red-300">
                    Exclude
                  </button>
                </form>
              )}
            </li>
          ))}
          {finalRows.length === 0 && <p className="py-4 text-sm text-neutral-500">No eligible students.</p>}
        </ul>
      </div>

      {excludedOverrides.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white">Manually excluded</h2>
          <ul className="mt-2 divide-y divide-neutral-800 text-sm">
            {excludedOverrides.map((o) => {
              const student = excludedStudentsById.get(o.student_id);
              return (
                <li key={o.id} className="flex items-center justify-between py-2">
                  <span className="text-neutral-400 line-through">
                    {student ? `${student.roll_no} ${student.name}` : o.student_id}
                  </span>
                  <form action={removeEligibilityOverride.bind(null, id, o.student_id)}>
                    <button type="submit" className="text-xs text-blue-400 hover:underline">
                      Restore
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-white">Manually include a student</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Adds a student from this JD&apos;s batch who isn&apos;t already on the eligible list.
        </p>
        <form action={includeStudentInJd.bind(null, id)} className="mt-2 flex gap-2">
          <select
            name="student_id"
            required
            className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
          >
            <option value="">Choose a student…</option>
            {availableToInclude.map((s) => (
              <option key={s.id} value={s.id}>
                {s.roll_no} — {s.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Include
          </button>
        </form>
        {availableToInclude.length === 0 && (
          <p className="mt-2 text-xs text-neutral-500">Every student in this batch is already eligible.</p>
        )}
      </div>
    </div>
  );
}
