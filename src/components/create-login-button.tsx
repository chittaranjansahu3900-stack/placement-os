"use client";

import { useActionState } from "react";
import { createStudentLogin, type CreateLoginState } from "@/app/actions/roster";

const initialState: CreateLoginState = {};

export function CreateLoginButton({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState(createStudentLogin, initialState);

  if (state.password) {
    return (
      <div className="rounded border border-emerald-800/80 bg-emerald-950/90 px-2.5 py-1 text-xs text-emerald-200 shadow-sm">
        Login active. Temp password: <code className="rounded bg-emerald-900/90 px-1 font-mono font-bold text-emerald-100">{state.password}</code>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="student_id" value={studentId} />
      <button
        type="submit"
        disabled={pending}
        className="ops-button-secondary py-1 px-2.5 min-h-0 text-[11px] font-mono"
      >
        {pending ? "Creating…" : "Create login"}
      </button>
      {state.error && <span className="font-mono text-[11px] text-red-400">{state.error}</span>}
    </form>
  );
}
