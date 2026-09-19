-- Placement OS — Batch profile snapshot & poster builder data layer
--
-- Design record: docs/BATCH-PROFILE-BUILDER.md.
--
-- One aggregate JSON per batch, computed from the roster and placement records, plus the
-- institute-level facts a poster needs but the roster doesn't hold (accreditations, rankings,
-- brand tokens, contact block, recruiter logos). Every number on a placement poster / LinkedIn
-- card renders from this snapshot and nothing else, so the poster, the Reports dashboard and an
-- outreach attachment always show the same figure from the same query.
--
-- Privacy: the snapshot is AGGREGATE ONLY — no student rows, names, roll numbers, contacts or
-- per-student CTC leave the function. Small-group protection: gender and PwD counts are
-- suppressed (null) when the batch has fewer than 10 students. Access is gated to the two
-- Reports permission sets (FR-7), inside the SECURITY DEFINER body. anon EXECUTE revoked
-- explicitly per the documented 0025 limitation.

-- ── Institute profile: brand + facts ──────────────────────────────────────────────────────

create table institute_profile (
  institute_id uuid primary key references institutes(id) on delete cascade,
  display_name text,                -- "Indian Institute of Management Raipur"
  tagline text,                     -- one line under the name
  brand jsonb not null default '{}',-- { "primary": "#1D3F8F", "accent": "#F5B400", "font": "IBM Plex Sans", "logo_path": "..." }
  -- Dated facts. Rankings change yearly; the "as_of" keeps last season's poster reproducible.
  -- { "accreditations": ["AACSB","AMBA"], "rankings": [{"body":"NIRF","rank":11,"as_of":"2026"}],
  --   "legacy_since": 2010, "clubs_count": 25, "international_partners": 12,
  --   "testimonials": [{"quote":"...","name":"...","title":"...","company":"..."}],
  --   "contact": {"email":"...","phone":"...","website":"..."} }
  facts jsonb not null default '{}',
  updated_by_user_id uuid references users(id),
  updated_at timestamptz not null default now()
);

alter table institute_profile enable row level security;
create policy institute_profile_select on institute_profile for select using (institute_id = current_institute_id());
create policy institute_profile_write on institute_profile for all
  using (institute_id = current_institute_id() and has_role('Admin'))
  with check (institute_id = current_institute_id() and has_role('Admin'));

-- ── Recruiter logos: institute-uploaded assets, never scraped ─────────────────────────────

alter table companies add column logo_path text; -- object path in the placement-files bucket (0020)

-- ── Taxonomies: free-text roster values → poster buckets ──────────────────────────────────
-- Institute-scoped so Raipur's "B.Tech (CSE)" and Indore's "BE Computer" both map to Engineering.

create type profile_taxonomy_kind as enum ('branch', 'sector', 'college');

create table profile_taxonomy (
  id uuid primary key default gen_random_uuid(),
  institute_id uuid not null references institutes(id) on delete cascade,
  kind profile_taxonomy_kind not null,
  pattern text not null,   -- case-insensitive regex tested against the raw value
  bucket text not null,    -- "Engineering", "BFSI", "IIT/NIT/BITS"
  priority int not null default 100, -- lower wins when several patterns match
  unique (institute_id, kind, pattern)
);

alter table profile_taxonomy enable row level security;
create policy profile_taxonomy_select on profile_taxonomy for select using (institute_id = current_institute_id());
create policy profile_taxonomy_write on profile_taxonomy for all
  using (institute_id = current_institute_id() and has_role('Admin'))
  with check (institute_id = current_institute_id() and has_role('Admin'));

-- Starter rules, applied to every existing institute. New institutes copy these on creation
-- (see seed_profile_taxonomy()).
create function seed_profile_taxonomy(p_institute_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into profile_taxonomy (institute_id, kind, pattern, bucket, priority) values
    (p_institute_id, 'branch', 'b\.?\s*tech|b\.?e\b|engineer|computer|electr|mechan|civil|chemical', 'Engineering', 10),
    (p_institute_id, 'branch', 'b\.?\s*com|commerce|c\.?a\b|chartered|account', 'Commerce', 20),
    (p_institute_id, 'branch', 'b\.?a\b|arts|econom|humanit|psycholog|sociolog|english', 'Arts', 30),
    (p_institute_id, 'branch', 'b\.?\s*sc|science|statist|math', 'Science', 40),
    (p_institute_id, 'branch', 'bba|bms|management', 'Management', 50),
    (p_institute_id, 'college', '\biit\b|indian institute of technology', 'IIT', 10),
    (p_institute_id, 'college', '\bnit\b|national institute of technology', 'NIT', 20),
    (p_institute_id, 'college', '\bbits\b|birla institute', 'BITS', 30),
    (p_institute_id, 'college', 'srcc|shri ram college', 'SRCC', 40),
    (p_institute_id, 'sector', 'tcs|infosys|wipro|hcl|cognizant|accenture|capgemini|tech|software|analytics|microsoft|google|amazon|oracle|ibm', 'IT / Analytics', 10),
    (p_institute_id, 'sector', 'bank|hdfc|icici|axis|sbi|kotak|finance|capital|goldman|morgan|jpmorgan|deloitte|ey\b|kpmg|pwc', 'BFSI / Professional services', 20),
    (p_institute_id, 'sector', 'mckinsey|bcg|bain|consult|zs\b', 'Consulting', 30),
    (p_institute_id, 'sector', 'tata|larsen|l&t|reliance|steel|motors|cement|manufactur|industr|adani', 'Manufacturing / Core', 40),
    (p_institute_id, 'sector', 'flipkart|swiggy|zomato|phonepe|paytm|myntra|nykaa|meesho|ola\b|uber', 'E-commerce / Startups', 50),
    (p_institute_id, 'sector', 'unilever|hul\b|itc\b|nestle|p&g|pepsi|coca|marico|dabur|britannia', 'FMCG', 60)
  on conflict do nothing;
$$;
revoke all on function seed_profile_taxonomy(uuid) from public;
revoke all on function seed_profile_taxonomy(uuid) from anon;
grant execute on function seed_profile_taxonomy(uuid) to authenticated;

select seed_profile_taxonomy(id) from institutes;

create function profile_bucket(p_institute_id uuid, p_kind profile_taxonomy_kind, p_value text)
returns text language sql stable security definer set search_path = public as $$
  select t.bucket from profile_taxonomy t
  where t.institute_id = p_institute_id and t.kind = p_kind and p_value ~* t.pattern
  order by t.priority limit 1;
$$;
revoke all on function profile_bucket(uuid, profile_taxonomy_kind, text) from public;
revoke all on function profile_bucket(uuid, profile_taxonomy_kind, text) from anon;
grant execute on function profile_bucket(uuid, profile_taxonomy_kind, text) to authenticated;

-- ── The snapshot ───────────────────────────────────────────────────────────────────────────

create function batch_profile_snapshot(p_batch_id uuid, p_baseline_batch_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_inst uuid;
  v_n int;
  v_result jsonb;
begin
  if p_batch_id is null then raise exception 'p_batch_id is required'; end if;

  select b.institute_id into v_inst from batches b where b.id = p_batch_id;
  if v_inst is null or v_inst <> current_institute_id() then return null; end if;
  if not (has_permission('Reports & Export') or has_permission('Reports - View Only')) then return null; end if;

  select count(*) into v_n from students s where s.batch_id = p_batch_id;

  with st as (
    select s.*,
           coalesce(profile_bucket(v_inst, 'branch', s.graduation_details->>'branch'), 'Others') as branch_bucket,
           profile_bucket(v_inst, 'college', s.graduation_details->>'college') as college_bucket
    from students s where s.batch_id = p_batch_id
  ),
  emp as (
    select st.id as student_id, e->>'company' as company,
           coalesce(profile_bucket(v_inst, 'sector', e->>'company'), 'Others') as sector
    from st, jsonb_array_elements(st.prior_employers) e
  ),
  cred as (
    select st.id as student_id, c as credential
    from st, jsonb_array_elements_text(
      (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(st.credentials) x where jsonb_typeof(x) = 'string')
    ) c
  ),
  pr as (
    select p.*, c.name as company_name, c.sector as company_sector
    from placement_records p join companies c on c.id = p.company_id
    join students s on s.id = p.student_id where s.batch_id = p_batch_id
  ),
  base_pr as (
    select p.*, c.name as company_name
    from placement_records p join companies c on c.id = p.company_id
    join students s on s.id = p.student_id where p_baseline_batch_id is not null and s.batch_id = p_baseline_batch_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'batch', (select jsonb_build_object('id', b.id, 'name', b.name, 'starts_on', b.starts_on, 'ends_on', b.ends_on) from batches b where b.id = p_batch_id),
    'size', v_n,
    -- small-group protection: demographic splits only when n >= 10
    'gender', case when v_n >= 10 then (
        select jsonb_object_agg(coalesce(lower(gender), 'unspecified'), n)
        from (select gender, count(*) n from st group by gender) g)
      else null end,
    'work_ex', jsonb_build_object(
      'average_months', (select round(avg(total_work_ex_months))::int from st),
      'median_months', (select percentile_cont(0.5) within group (order by total_work_ex_months)::int from st),
      'buckets', jsonb_build_object(
        'freshers', (select count(*) from st where total_work_ex_months = 0),
        '1_12', (select count(*) from st where total_work_ex_months between 1 and 12),
        '13_24', (select count(*) from st where total_work_ex_months between 13 and 24),
        '25_36', (select count(*) from st where total_work_ex_months between 25 and 36),
        '37_plus', (select count(*) from st where total_work_ex_months > 36)
      ),
      'sectors', (select coalesce(jsonb_object_agg(sector, n), '{}') from (
          select sector, count(distinct student_id) n from emp group by sector) x),
      'past_employers', (select coalesce(jsonb_agg(jsonb_build_object('name', company, 'students', n) order by n desc, company), '[]')
          from (select company, count(distinct student_id) n from emp where company is not null group by company limit 60) x)
    ),
    'education', jsonb_build_object(
      'branches', (select coalesce(jsonb_object_agg(branch_bucket, n), '{}') from (select branch_bucket, count(*) n from st group by branch_bucket) x),
      'premier_institutes', (select coalesce(jsonb_object_agg(college_bucket, n), '{}') from (
          select college_bucket, count(*) n from st where college_bucket is not null group by college_bucket) x),
      'premier_institutes_total', (select count(*) from st where college_bucket is not null),
      'specializations', (select coalesce(jsonb_object_agg(spec, n), '{}') from (
          select coalesce(pg_details->>'specialization', 'Unspecified') spec, count(*) n from st group by 1) x),
      'professional_credentials', (select coalesce(jsonb_object_agg(k, n), '{}') from (
          select case
            when credential ~* '\bcfa\b' then 'CFA'
            when credential ~* '\bfrm\b' then 'FRM'
            when credential ~* '\bca\b|chartered accountant' then 'CA'
            when credential ~* '\bcs\b|company secretary' then 'CS'
            when credential ~* 'acca' then 'ACCA'
          end k, count(distinct student_id) n
          from cred group by 1) x where k is not null)
    ),
    'placements', case when (select count(*) from pr) = 0 then null else jsonb_build_object(
      'placed', (select count(*) from pr),
      'placement_rate', round((select count(*) from pr)::numeric / nullif(v_n, 0) * 100, 1),
      'ctc_highest', (select max(final_ctc) from pr),
      'ctc_average', (select round(avg(final_ctc), 2) from pr),
      'ctc_median', (select round(percentile_cont(0.5) within group (order by final_ctc)::numeric, 2) from pr where final_ctc is not null),
      'ctc_top_decile_average', (select round(avg(final_ctc), 2) from (
          select final_ctc from pr where final_ctc is not null order by final_ctc desc
          limit greatest(1, (select count(*) from pr where final_ctc is not null) / 10)) t),
      'recruiters', (select count(distinct company_id) from pr),
      'new_recruiters', (select count(distinct company_id) from pr where company_id not in (select company_id from base_pr)),
      'sectors', (select coalesce(jsonb_object_agg(coalesce(company_sector, 'Others'), n), '{}') from (
          select company_sector, count(*) n from pr group by 1) x),
      'top_recruiters', (select coalesce(jsonb_agg(jsonb_build_object('name', company_name, 'offers', n, 'logo_path', logo_path) order by n desc, company_name), '[]')
          from (select p.company_name, count(*) n, c.logo_path from pr p join companies c on c.id = p.company_id group by p.company_name, c.logo_path limit 60) x)
    ) end,
    'baseline', case when p_baseline_batch_id is null then null else jsonb_build_object(
      'batch_id', p_baseline_batch_id,
      'placed', (select count(*) from base_pr),
      'ctc_average', (select round(avg(final_ctc), 2) from base_pr),
      'ctc_median', (select round(percentile_cont(0.5) within group (order by final_ctc)::numeric, 2) from base_pr where final_ctc is not null),
      'recruiters', (select count(distinct company_id) from base_pr)
    ) end,
    'institute', (select jsonb_build_object(
        'name', coalesce(ip.display_name, i.name), 'tagline', ip.tagline, 'brand', ip.brand, 'facts', ip.facts)
      from institutes i left join institute_profile ip on ip.institute_id = i.id where i.id = v_inst)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function batch_profile_snapshot(uuid, uuid) from public;
revoke all on function batch_profile_snapshot(uuid, uuid) from anon;
grant execute on function batch_profile_snapshot(uuid, uuid) to authenticated;
