import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { withdrawApplication } from "@/app/actions/applications";
import type { Application } from "@/types/domain";

type ApplicationWithJd = Application & {
  jds: { role_title: string; apply_by_deadline: string; companies: { name: string } | null } | null;
};

// FR-3.3: "My Applications" view — live status per company.
export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
        <h1 className="text-lg font-semibold text-white">My Applications</h1>
        <p className="mt-2 text-sm text-neutral-500">
          No student profile is linked to your account yet — check with your CDPO Admin.
        </p>
      </div>
    );
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("*, jds(role_title, apply_by_deadline, companies(name))")
    .eq("student_id", student.id)
    .order("applied_at", { ascending: false });

  const rows = (applications ?? []) as ApplicationWithJd[];

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-white">My Applications</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Applied → Under Review → Shortlisted → Interview → Selected / Rejected / Waitlisted.
      </p>

      {error && (
        <p className="mt-4 rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-6 divide-y divide-neutral-800">
        {rows.map((a) => {
          const canWithdraw =
            !a.withdrawn_at && a.jds && new Date(a.jds.apply_by_deadline) > new Date();
          return (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-white">
                  {a.jds?.companies?.name ?? "Unknown company"} — {a.jds?.role_title ?? "—"}
                </p>
                <p className="text-xs text-neutral-500">
                  Applied {new Date(a.applied_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
                  {a.withdrawn_at ? "Withdrawn" : a.status}
                </span>
                {canWithdraw && (
                  <form action={withdrawApplication}>
                    <input type="hidden" name="application_id" value={a.id} />
                    <button type="submit" className="text-xs text-red-400 hover:underline">
                      Withdraw
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 && <p className="py-6 text-sm text-neutral-500">No applications yet.</p>}
      </ul>
    </div>
  );
}
