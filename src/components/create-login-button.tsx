"use client";

import { useActionState } from "react";
import { createStudentLogin, type CreateLoginState } from "@/app/actions/roster";

const initialState: CreateLoginState = {};

// A client component (not just a plain <form action>) specifically so the
// one-time temp password can be shown inline via useActionState instead of
// round-tripping it through a redirect URL, which would leak it into
// browser history and server access logs.
export function CreateLoginButton({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState(createStudentLogin, initialState);

  if (state.password) {
    return (
      <div className="rounded-md border border-emerald-900 bg-emerald-950 px-2 py-1 text-xs text-emerald-300">
        Login created. One-time password: <code className="font-mono">{state.password}</code>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="student_id" value={studentId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-500 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create login"}
      </button>
      {state.error && <span className="text-xs text-red-400">{state.error}</span>}
    </form>
  );
}
