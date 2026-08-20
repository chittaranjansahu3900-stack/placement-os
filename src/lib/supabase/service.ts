import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only, bypasses RLS — never import into a Client Component and never
// expose SUPABASE_SERVICE_ROLE_KEY to the browser.
//
// Needed for the parts of the user lifecycle (BRD Section 7.5) that must run
// before a `users` row exists, since RLS identity (current_user_id() in the
// migrations) is derived from that row: SSO/invite signup provisioning and
// the batch roster import (FR-9.1).
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
