# Batch profile & poster builder — design record

**Added:** 19 September 2026. **Migration:** `0028_batch_profile_snapshot.sql` (not yet applied to hosted Supabase). **Tests:** `src/lib/profile/profile.test.ts` (11 Vitest). **Route:** `/reports/profile` (UI), `GET /api/reports/profile` (HTML / PNG / PDF / JSON).

## What it is

Every IIM sends recruiters an "Invitation for Placements" one-pager and posts placement statistics on LinkedIn. Today those are made by hand in Canva from spreadsheets, once a season, and the numbers on the poster, in the mailer and in the final report drift apart. This builder renders them from the roster and placement records the CDPO already maintains in PlacementOS — any occasion, any audience, any format — so the same query produces every figure a recruiter ever sees.

## Three layers

| Layer | Where | What it guarantees |
|---|---|---|
| **Snapshot** | `batch_profile_snapshot(batch, baseline)` in `0028` | One aggregate JSON per batch. No student rows leave the function. Gender/PwD splits suppressed under 10 students. Gated to `Reports & Export` / `Reports - View Only`, tenant-scoped, anon revoked. Free-text roster values map to poster buckets through `profile_taxonomy` (regex → bucket, per institute, Admin-editable) so "B.Tech (CSE)" and "BE Computer" both count as Engineering. |
| **Composition** | `src/lib/profile/compose.ts` | Picks the lead stat and block order for an audience (finance leads with CA/CFA/FRM; consulting and technology with IIT/NIT/BITS) and an occasion (a report leads with CTC; an invitation leads with the batch). Deterministic by default. Optional model pass (`?ai=1`) may reorder blocks and write the headline — under two checked rules: it can only name blocks that have data, and **the headline may contain no numbers except a nearby year** (`headlineHasNoFigures`). A rejected reply falls back to the deterministic spec. The model never types a figure; the template renders every figure from the snapshot path. |
| **Render** | `src/lib/profile/render.ts` | One engine, brand tokens from `institute_profile.brand`, four formats: A4 landscape 1600×1131, LinkedIn/email 1200×627, LinkedIn square 1080×1080, portrait/story 1080×1350. Blocks are self-contained (stat tiles, bars, donut, logo grid, testimonials, season-over-season). Overlaps are deduplicated (a stat shown as the lead is not repeated in its block). Institute text is escaped. PNG/PDF via Playwright when Chromium is present; HTML always works. |

## What a poster can show today, from existing data

Batch size · gender split · work-ex buckets, average, median · sector of prior work-ex · past employers · educational background · premier institutes (IIT/NIT/BITS/SRCC) · CA/CFA/FRM/CS/ACCA counts · specialisations · median/average/highest/top-decile CTC · recruiters and new recruiters · offers by sector · past recruiters · season-over-season deltas.

## What needs institute input (new in `0028`)

- `institute_profile` — display name, tagline, brand (`primary`, `accent`, `font`, `logo_url`), dated facts (accreditations, rankings with `as_of`, legacy year, clubs, international partners, testimonials, contact block). Admin-only. **No Admin UI yet** — populate via SQL or the Supabase dashboard for the pilot.
- `companies.logo_path` — logos are uploaded by the placement office into the existing private bucket (`0020`) and signed at render time. The system never scrapes logos: they are trademarks and the institute should hold the file it is publishing. **No upload UI yet** — set the path on the company row for the pilot.
- `profile_taxonomy` — seeded with starter rules for every existing institute (`seed_profile_taxonomy()`); new institutes need the seed called once.

## Why this is defensible

A generic poster tool needs someone to type the numbers. This one cannot show a number that isn't in the roster: the template has no literals, the snapshot is the only input, and the one place a model writes prose is fenced so it cannot introduce a figure. The audience variants come from the same snapshot, so a finance recruiter's LinkedIn card and the Dean's season report agree to the decimal. And because the snapshot is a database function, the same JSON is what the outreach agent attaches when a company asks for the batch profile.

## Not done yet

- Apply `0028` and write a pgTAP test for `batch_profile_snapshot()` (tenant isolation, permission gate, no student-level fields in the JSON, small-group suppression).
- Admin UI for `institute_profile`, taxonomy rules and company logos.
- Institute photo background variant (Sirmaur/Kozhikode style) — `brand.photo_url` is accepted but no template uses it yet.
- A caption generator for the LinkedIn post text (same numbers guard; deterministic default).
- Snapshot versioning: store the JSON used for each rendered poster so last season's poster is reproducible after the roster changes.
