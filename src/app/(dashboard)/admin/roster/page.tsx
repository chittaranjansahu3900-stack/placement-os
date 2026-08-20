import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { CreateLoginButton } from "@/components/create-login-button";
import { RosterImportReview } from "@/components/roster-import-review";
import { createBatch, setBatchActive } from "@/app/actions/admin";
import type { Batch, Student } from "@/types/domain";

// FR-9.1 + Appendix D: batch roster import with a staged validation review
// before the Admin commits any rows.
export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; imported?: string; skipped?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (!ctx || !ctx.roleNames.includes("Admin")) redirect("/dashboard");

  const { error, imported, skipped } = await searchParams;
  const supabase = await createClient();

  const { data: batches } = await supabase.from("batches").select("*").order("name");
  const batchRows = (batches ?? []) as Batch[];

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .order("roll_no")
    .limit(200);
  const studentRows = (students ?? []) as Student[];

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-white">Roster Import</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Review parsed Profile Sheet rows and validation issues before committing the import.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {imported && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Imported {imported} student{Number(imported) === 1 ? "" : "s"}
          {skipped && Number(skipped) > 0 ? `; skipped ${skipped} invalid rows` : ""}.
        </p>
      )}

      <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="text-sm font-semibold text-white">Batch / season setup</h2>
        <form action={createBatch} className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-neutral-400 sm:col-span-2">Batch name<input name="name" required placeholder="PGP 2026-28" className="mt-1 block w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-600" /></label>
          <label className="text-xs text-neutral-400">Starts on<input name="starts_on" type="date" className="mt-1 block w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-600" /></label>
          <label className="text-xs text-neutral-400">Ends on<input name="ends_on" type="date" className="mt-1 block w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-600" /></label>
          <button type="submit" className="w-fit rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">Create batch</button>
        </form>
        {batchRows.length > 0 && (
          <ul className="mt-4 divide-y divide-neutral-800">
            {batchRows.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <div><p className="text-white">{batch.name}</p><p className="text-xs text-neutral-500">{batch.starts_on ?? "No start date"} → {batch.ends_on ?? "No end date"} · {batch.is_active ? "Active" : "Archived"}</p></div>
                <form action={setBatchActive.bind(null, batch.id, !batch.is_active)}><button type="submit" className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500">{batch.is_active ? "Archive" : "Reactivate"}</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {batchRows.length > 0 ? (
        <RosterImportReview batches={batchRows} />
      ) : (
        <p className="rounded-md border border-amber-900 bg-amber-950 px-3 py-2 text-sm text-amber-300">
          Create a batch before importing students.
        </p>
      )}

      <div>
        <h2 className="text-sm font-semibold text-white">Students ({studentRows.length} shown)</h2>
        <ul className="mt-3 divide-y divide-neutral-800">
          {studentRows.map((student) => (
            <li key={student.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="text-white">{student.roll_no}</span>{" "}
                <span className="text-neutral-400">{student.name}</span>
              </div>
              {student.user_id ? (
                <span className="text-xs text-neutral-500">Has login</span>
              ) : (
                <CreateLoginButton studentId={student.id} />
              )}
            </li>
          ))}
          {studentRows.length === 0 && (
            <p className="py-6 text-sm text-neutral-500">No students imported yet.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
