import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export default async function DashboardPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");

  if (ctx.appUser.status === "pending") {
    return (
      <div className="max-w-lg rounded-lg border border-amber-900 bg-amber-950/40 p-6">
        <h1 className="text-lg font-semibold text-amber-200">Waiting on approval</h1>
        <p className="mt-2 text-sm text-amber-300/80">
          Your account is created but pending review by a CDPO Admin (Section 7.5 of the BRD).
          You&apos;ll get access as soon as it&apos;s approved.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-white">Welcome, {ctx.appUser.name}</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Role{ctx.roleNames.length > 1 ? "s" : ""}: {ctx.roleNames.join(", ") || "none assigned yet"}
      </p>
    </div>
  );
}
