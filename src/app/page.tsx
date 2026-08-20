import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center">
      <p className="text-xs uppercase tracking-widest text-neutral-500">iitiimcareers.in</p>
      <h1 className="mt-3 text-4xl font-semibold text-white">Placement OS</h1>
      <p className="mt-4 max-w-md text-neutral-400">
        One connected pipeline for campus placements — company onboarding through final
        placement reporting.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Register your company
        </Link>
      </div>
    </div>
  );
}
