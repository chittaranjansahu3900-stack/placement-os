-- PlacementOS — close the schema-wide anon-EXECUTE gap on SECURITY DEFINER functions.
--
-- Section 6 P0 #8 of docs/BRD-IMPLEMENTATION-STATUS.md, flagged during the 0023 review and closed
-- per-function (not schema-wide) in 0024. Two independent grant sources make a function reachable
-- by `anon`, and both have to be closed:
--   1. Postgres itself implicitly grants EXECUTE to the PUBLIC pseudo-role on every function at
--      CREATE time, unless the creating migration explicitly revokes it. `anon` inherits this like
--      every other role — a targeted `revoke ... from anon` alone does NOT remove it, because the
--      grant is held by PUBLIC, not by `anon` specifically.
--   2. Supabase's own project provisioning separately grants EXECUTE to `anon` directly (a
--      default-privilege-style grant independent of PUBLIC), confirmed during the 0023 review —
--      `revoke ... from public` alone never touches this one.
-- This schema's existing per-function pattern (0004, 0014, 0017, 0018, 0023, 0024) already closes
-- both for the specific functions it touches (`revoke ... from public`, `revoke ... from anon`,
-- `grant execute ... to authenticated`). Most of the schema's other SECURITY DEFINER functions
-- never got that treatment and are still reachable via source #1 above — this migration closes it
-- schema-wide instead of function-by-function.
--
-- EXCLUDED BY NAME, deliberately, not an oversight: current_user_id, current_institute_id,
-- current_company_id, current_student_id, has_permission, has_role (all defined in
-- 0002_rls_policies.sql). These six are SECURITY DEFINER but are not application-facing RPCs —
-- they're referenced inside RLS USING/WITH CHECK expressions on nearly every table in the schema.
-- Postgres requires the role performing a query to hold EXECUTE on any function referenced by a
-- policy on the table it's querying, independent of that function's own SECURITY DEFINER/INVOKER
-- mode — revoking anon's EXECUTE on them would not change what anon can see (these already
-- resolve to null/false for an unauthenticated caller, so every policy that uses them still denies
-- correctly), but it would turn a clean "0 rows" result into a hard `permission denied for
-- function` error for any future anon-role query against any RLS-protected table. No current code
-- path issues such a query (checked: no `.from()` call against a Postgres table anywhere in
-- src/app/(auth)/, only Supabase Auth API calls before login), but these six are load-bearing
-- infrastructure for RLS itself, not the kind of narrowly-scoped business RPC this fix targets.
--
-- Every matched function also gets an explicit `grant execute ... to authenticated` in the same
-- pass. Several of them (log_audit_event among them — called via .rpc() from every audited action
-- in the app) never had their own explicit authenticated grant; they worked only because of the
-- implicit PUBLIC grant this migration removes. Without re-granting explicitly, revoking PUBLIC
-- would have silently broken every real authenticated caller of those functions.
--
-- Scoped dynamically (not one revoke line per function) so this stays correct as the schema grows,
-- per the BRD note: "worth a single schema-wide fix instead of relying on that holding true for
-- all 33 forever."

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.proname not in (
        'current_user_id', 'current_institute_id', 'current_company_id',
        'current_student_id', 'has_permission', 'has_role'
      )
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$$;

-- Attempted future-proofing — KNOWN NOT TO FULLY WORK, kept anyway because it's harmless and may
-- help in some cases: this is supposed to make any function created by a later migration default
-- to no EXECUTE grant at all, so a future SECURITY DEFINER function would need its own explicit
-- `grant execute ... to authenticated` to be callable. Verified empirically (23 August 2026,
-- against the hosted project) that it does NOT reliably hold: `pg_default_acl` correctly records
-- the revoke (no `public`/`anon` entry for role `postgres` in schema `public`, object type `f`),
-- but a function created immediately afterward, by the same role, in the same schema, still
-- carries an implicit PUBLIC EXECUTE grant in its own `proacl` — reproduced twice, including a
-- single-session before/after check ruling out replication lag or a stale connection. The exact
-- mechanism re-asserting it wasn't identified (checked: not `grant_pg_graphql_access`, not the
-- `pgrst_ddl_watch`/`pgrst_drop_watch` event triggers — both just `NOTIFY` for schema-cache
-- reload — so something in Supabase's managed layer, not this project's own event triggers).
-- CONSEQUENCE: this migration protects every function that existed when it ran (verified, see the
-- DO block above and 003_anon_function_execute_lockdown.test.sql). It does NOT protect functions
-- created by later migrations. Every future migration that adds a SECURITY DEFINER function must
-- keep doing what 0004/0014/0017/0018/0023/0024 already do explicitly per function:
--   revoke all on function <sig> from public;
--   revoke all on function <sig> from anon;
--   grant execute on function <sig> to authenticated;
-- Do not treat this migration as having made that step optional.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
