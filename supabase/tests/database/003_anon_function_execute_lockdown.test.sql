-- pgTAP coverage for migration 0025 (Section 6 P0 #8 of docs/BRD-IMPLEMENTATION-STATUS.md):
-- `anon` must not hold EXECUTE on any SECURITY DEFINER "business RPC" in the public schema, while
-- the six RLS-predicate helper functions (current_user_id, current_institute_id,
-- current_company_id, current_student_id, has_permission, has_role) must keep it, since Postgres
-- requires the querying role to hold EXECUTE on any function an RLS policy references, regardless
-- of that function's own SECURITY DEFINER/INVOKER mode.
--
-- The real fix had to revoke from PUBLIC, not just from anon: Postgres implicitly grants EXECUTE
-- to the PUBLIC pseudo-role on every function at CREATE time, and anon inherits that like every
-- other role — a targeted `revoke ... from anon` alone left every function that never got its own
-- explicit `revoke ... from public` (most of them) still reachable. Revoking from PUBLIC also
-- would have silently broken `authenticated` callers of functions that had no explicit
-- authenticated grant of their own (log_audit_event among them, called via .rpc() from every
-- audited action in the app) — assertion 5 below guards against exactly that regression.
--
-- Assertion 2 matches on exact signature (schema-qualified regprocedure text), not bare proname:
-- `create extension if not exists pgtap` (used by every test file, including this one) installs
-- pgtap's own same-named `has_role` overload into the public schema for the duration of this
-- transaction, which a bare `proname in (...)` filter would double-count.
--
-- This file deliberately does NOT assert that a function created after 0025 lacks anon EXECUTE by
-- default. 0025's own header comment documents why: its `ALTER DEFAULT PRIVILEGES` statements were
-- verified (23 August 2026) to not reliably prevent that in this Supabase-managed Postgres — a
-- freshly created function still carries an implicit PUBLIC EXECUTE grant despite a correctly
-- revoked `pg_default_acl` entry, root cause not identified. Asserting the intended-but-unverified
-- behavior here would make this suite lie about what's actually protected; the real, working
-- protection is the DO block covering everything that existed when 0025 ran (assertions 1-4 below),
-- plus this codebase's existing per-migration discipline for anything created after.
--
-- Grant-level checks only, no fixture rows needed.

begin;
create extension if not exists pgtap;

select plan(5);

-- 1. No SECURITY DEFINER function in public (outside the six RLS helpers) grants anon EXECUTE.
select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.proname not in (
        'current_user_id', 'current_institute_id', 'current_company_id',
        'current_student_id', 'has_permission', 'has_role'
      )
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'anon holds no EXECUTE on any business SECURITY DEFINER function'
);

-- 2. The six RLS helpers still grant anon EXECUTE (positive control: confirms the exclusion list
--    actually took effect, rather than the whole revoke silently being a no-op). Matched by exact
--    signature to avoid double-counting pgtap's own transiently-installed has_role(text,text).
select is(
  (
    select count(*)::int
    from unnest(array[
      'current_user_id()', 'current_institute_id()', 'current_company_id()',
      'current_student_id()', 'has_permission(text)', 'has_role(text)'
    ]) as sig
    where has_function_privilege('anon', ('public.' || sig)::regprocedure, 'EXECUTE')
  ),
  6,
  'all six RLS-predicate helper functions still grant anon EXECUTE'
);

-- 3. A real business RPC rejects anon at the grant level (not just its own internal guard).
reset role;
set local role anon;
select throws_ok(
  $$select release_jd_to_batch('00000000-0000-0000-0000-000000000000')$$,
  '42501',
  null,
  'anon cannot execute release_jd_to_batch (no EXECUTE grant)'
);

-- 4. A helper function is still callable by anon and simply resolves to null, no error — proves
--    the exclusion is real, not just a catalog artifact.
select is(current_user_id(), null, 'anon can still call current_user_id() (resolves to null, no error)');

reset role;

-- 5. authenticated still holds EXECUTE on a function that had no grant of its own before 0025 and
--    relied entirely on the implicit PUBLIC grant this migration removes — proves the explicit
--    re-grant in 0025's DO block actually ran, not just the revoke half.
select ok(
  has_function_privilege('authenticated', 'log_audit_event(text,text,uuid,jsonb)', 'EXECUTE'),
  'authenticated still holds EXECUTE on log_audit_event after the PUBLIC revoke'
);

select * from finish();
rollback;
