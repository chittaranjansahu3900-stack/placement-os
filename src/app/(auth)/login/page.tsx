import Link from "next/link";
import { login } from "@/app/actions/auth";
import { OpsIcon } from "@/components/ops-icon";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090d16] px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Banner */}
        <div className="text-center">
          <div className="mb-3 inline-flex size-11 items-center justify-center rounded-lg bg-blue-600 font-bold text-white shadow-md shadow-blue-500/20">
            PO
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Placement<span className="text-blue-400">OS</span>
          </h1>
          <p className="mt-1 text-xs font-mono text-slate-400">
            Career Development &amp; Placement Office · IIM Raipur
          </p>
        </div>

        {/* Card */}
        <div className="space-y-5 rounded-lg border border-slate-750 bg-slate-900/90 p-8 shadow-xl">
          <div>
            <h2 className="text-base font-bold text-white">Operational Sign In</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Access candidate matrices, hiring funnels, and committee tools.
            </p>
          </div>

          {message && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-800/80 bg-emerald-950/70 p-3 text-xs text-emerald-200 shadow-sm">
              <OpsIcon name="check" size={14} className="text-emerald-400 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3 text-xs text-red-200 shadow-sm">
              <OpsIcon name="alert-triangle" size={14} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form action={login} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Institutional / Corporate Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@iimraipur.ac.in or work email"
                className="ops-input mt-1.5 w-full text-xs text-white"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="ops-input mt-1.5 w-full text-xs text-white font-mono"
              />
            </div>

            <button
              type="submit"
              className="ops-button-primary w-full justify-center text-xs py-2.5"
            >
              Authenticate &amp; Enter Console
            </button>
          </form>

          <div className="border-t border-slate-800 pt-4 text-center">
            <p className="text-xs text-slate-400">
              Corporate Recruiter without an account?{" "}
              <Link href="/signup" className="text-blue-400 font-semibold hover:underline">
                Register Company
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
