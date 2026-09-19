
# Drop 2 — Batch profile & poster builder (docs/BATCH-PROFILE-BUILDER.md)
- supabase/migrations/0028_batch_profile_snapshot.sql — institute_profile, profile_taxonomy (+seed), companies.logo_path, batch_profile_snapshot(), profile_bucket()
- src/lib/profile/{snapshot,compose,render}.ts + profile.test.ts (11 tests; SAMPLE fixture is fictional)
- src/app/api/reports/profile/route.ts — HTML / PNG / PDF / JSON; optional model pass with the no-figures headline guard
- src/app/(dashboard)/reports/profile/page.tsx — builder UI (batch, baseline, occasion, audience, format, live preview)
- src/app/(dashboard)/reports/page.tsx — link to the builder
- Verified: npm test 95/95, tsc clean (bar pre-existing LayoutProps), eslint clean. Rendered locally via Playwright for all formats (see canvas page "Poster builder").
