import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges a Supabase auth code (magic link / future OAuth-SSO redirect —
// see the SSO TODO in src/proxy.ts) for a session cookie.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`);
}
