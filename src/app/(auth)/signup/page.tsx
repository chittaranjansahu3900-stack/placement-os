import Link from "next/link";
import { signupRecruiter } from "@/app/actions/auth";
import { OpsIcon } from "@/components/shared/ops-icon";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
            Corporate Recruiter Onboarding Portal
          </p>
        </div>

        {/* Card */}
        <div className="space-y-5 rounded-lg border border-slate-750 bg-slate-900/90 p-8 shadow-xl">
          <div>
            <h2 className="text-base font-bold text-white">Corporate Self-Registration</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Register company partner profile. CDPO Admin approves all new accounts.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3 text-xs text-red-200 shadow-sm">
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
                className="ops-input mt-1.5 w-full text-xs text-white"
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
                className="ops-input mt-1.5 w-full text-xs text-white"
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
                className="ops-input mt-1.5 w-full text-xs text-white"
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
                className="ops-input mt-1.5 w-full text-xs text-white font-mono"
              />
            </div>

            <button
              type="submit"
              className="ops-button-primary w-full justify-center text-xs py-2.5"
            >
              Submit Registration Request
            </button>
          </form>

          <div className="border-t border-slate-800 pt-4 text-center">
            <p className="text-xs text-slate-400">
              Already have an approved account?{" "}
              <Link href="/login" className="text-blue-400 font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
