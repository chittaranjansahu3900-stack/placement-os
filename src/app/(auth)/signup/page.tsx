import Link from "next/link";
import { signupRecruiter } from "@/app/actions/auth";

// FR-1.1 recruiter self-registration. Student/SPC/BD/Admin accounts are
// provisioned via roster import and Admin invite (Section 3.4, 7.5), not
// through a public signup form — this page is recruiter-only by design.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Register your company</h1>
          <p className="mt-1 text-sm text-neutral-400">
            For recruiters. An Admin reviews every new account before it goes live.
          </p>
        </div>

        {error && (
          <p className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <form action={signupRecruiter} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm text-neutral-300">
              Your name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label htmlFor="company" className="block text-sm text-neutral-300">
              Company name
            </label>
            <input
              id="company"
              name="company"
              type="text"
              required
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm text-neutral-300">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-neutral-300">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              className="mt-1 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-600"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Create account
          </button>
        </form>

        <p className="text-sm text-neutral-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
