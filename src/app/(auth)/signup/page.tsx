import Link from "next/link";
import { signupRecruiter } from "@/app/actions/auth";
import { OpsIcon } from "@/components/ops-icon";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080c14] px-4 selection:bg-amber-500/20 selection:text-amber-200">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Banner */}
        <div className="text-center">
          <div className="mb-3 inline-flex size-12 items-center justify-center border border-blue-500 bg-blue-950 font-display text-xl font-bold text-blue-200">
            PO
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Placement<span className="text-amber-400">OS</span>
          </h1>
          <p className="mt-1 text-xs font-mono text-slate-400">
            Corporate Recruiter Onboarding Portal
          </p>
        </div>

        {/* Card */}
        <div className="space-y-5 rounded-2xl border border-slate-800 bg-[#101e30] p-8">
          <div>
            <h2 className="text-base font-bold text-white">Corporate Self-Registration</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Register company partner profile. CDPO Admin approves all new accounts.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/50 p-3 text-xs text-red-200">
              <OpsIcon name="alert-triangle" size={14} className="text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form action={signupRecruiter} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Your Full Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. Priya Iyer"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="company" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Recruiting Company Name *
              </label>
              <input
                id="company"
                name="company"
                type="text"
                required
                placeholder="e.g. Google India / McKinsey"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Official Corporate Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.com"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                placeholder="Minimum 8 characters"
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              className="ops-button-primary w-full justify-center"
            >
              Submit Registration Request
            </button>
          </form>

          <div className="border-t border-slate-800 pt-4 text-center">
            <p className="text-xs text-slate-400">
              Already have an approved account?{" "}
              <Link href="/login" className="text-amber-400 font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
