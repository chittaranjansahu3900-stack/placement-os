-- Placement OS — pilot seed data
-- The IIM Raipur single-tenant pilot (BRD Section 12.2) needs exactly one
-- `institutes` row to exist so app code has something to resolve
-- NEXT_PUBLIC_INSTITUTE_SLUG against (see src/app/actions/auth.ts). Nothing
-- else in the schema depends on this specific row — swap the name/slug for
-- a different pilot institute freely.

insert into institutes (name, slug) values ('IIM Raipur', 'iim-raipur')
on conflict (slug) do nothing;

insert into batches (institute_id, name, is_active)
select id, 'PGP 2024-26', true from institutes where slug = 'iim-raipur'
on conflict (institute_id, name) do nothing;

insert into institute_settings (institute_id, defaults_threshold, staleness_days)
select id, 4, 3 from institutes where slug = 'iim-raipur'
on conflict (institute_id) do nothing;
