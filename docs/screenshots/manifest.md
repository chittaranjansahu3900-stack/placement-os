# PlacementOS Screen & Interaction Manifest

Generated automated screenshots for PlacementOS technical documentation.

| Filename | Route | Persona / Role | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| `01-login.png` | `/login` | **Logged out** | Sign-in portal for students, recruiters, coordinators, and administrators | ✅ Success |
| `02-signup.png` | `/signup` | **Logged out** | Recruiter corporate self-registration portal for company onboarding | ✅ Success |
| `03-dashboard-pending.png` | `/dashboard` | **Pending Recruiter** | Dashboard view for newly registered recruiter waiting on CDPO administrative approval | ✅ Success |
| `04-dashboard.png` | `/dashboard` | **Admin** | Main administrative dashboard showing role privileges and full navigation access | ✅ Success |
| `05-jds-list.png` | `/jds` | **Admin** | Job Descriptions management showing active season JDs and reusable historical templates | ✅ Success |
| `06-jd-new.png` | `/jds/new` | **Admin** | Job Description creation form with compensation, eligibility rules, and approval settings | ✅ Success |
| `07-jd-detail.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24` | **Admin** | Detailed JD overview displaying live eligible candidate counts, status transitions, and attachments | ✅ Success |
| `08-jd-eligibility.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24/eligibility` | **Admin** | Student eligibility override console showing auto-qualified cohort and manual include/exclude actions | ✅ Success |
| `09-jobs-student.png` | `/jobs` | **Student** | Student job portal displaying published JDs with automated batch eligibility checks and 1-click apply | ✅ Success |
| `10-applications-student.png` | `/applications` | **Student** | Real-time candidate application tracker showing live statuses across companies and withdrawal controls | ✅ Success |
| `11-spc-dashboard.png` | `/spc` | **SPC** | SPC coordination dashboard tracking active hiring pipelines, staleness alerts, and interview round progress | ✅ Success |
| `12-applicants-recruiter.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24/applicants` | **Recruiter** | Recruiter candidate directory with multi-field filtering, CGPA sorting, and candidate evaluation tools | ✅ Success |
| `12a-masked.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24/applicants` | **Recruiter** | Recruiter matrix evidence: current RLS/view interaction omits pre-shortlist rows instead of rendering masked contacts | ⚠️ no masked pre-shortlist row is rendered for a standard Recruiter account |
| `12b-unmasked.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24/applicants` | **Recruiter** | Candidate directory showing unmasked phone and email contacts revealed upon candidate shortlisting | ✅ Success |
| `12c-bulk-shortlist.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24/applicants` | **Recruiter** | Bulk shortlist action UI in mid-selection state with multiple candidates checked and action bar populated | ✅ Success |
| `13-applicant-packets.png` | `/jds/c5452b61-bfe3-4902-9651-d0818803de24/applicants/packets` | **Recruiter** | Merged candidate packets compilation for seamless offline committee and interviewer review | ✅ Success |
| `14-companies-kanban.png` | `/companies` | **Admin** | Pre-season corporate outreach CRM Kanban board with 5-stage pipeline and JPC response funnel | ✅ Success |
| `14b-kanban-drag.png` | `/companies` | **Admin** | Kanban card hover state; the current board has no drag or inline stage-change control | ⚠️ requested drag/stage-change affordance is not implemented on /companies |
| `15-company-detail.png` | `/companies/02b53f1c-b9c1-44a3-99a7-097465d7b7f6` | **Admin** | Company detail hub with supervisory tracking, contact directory, persona outreach composer, and activity log | ✅ Success |
| `16-defaults-admin.png` | `/admin/defaults` | **Admin** | Institute compliance and attendance defaults tracker with threshold configuration and CSV importer | ✅ Success |
| `17-defaults-student.png` | `/defaults` | **Student** | Student self-service compliance view tracking attended activities and penalty defaults | ✅ Success |
| `18-reports-dashboard.png` | `/reports` | **Admin** | Placement analytics dashboard featuring live CTC statistics, placement rates, and season comparison metrics | ✅ Success |
| `19-reports-export.png` | `/reports` | **Admin** | Expanded audited export panel; submitting it calls the non-rendered /reports/export CSV endpoint | ✅ Success |
| `20-resume-list.png` | `/resume` | **Student** | Interactive Placement CV Maker with profile prefilling, persona-tailored versions, and JD fit analysis | ✅ Success |
| `21-resume-editor.png` | `/resume/5c0e10db-9449-495f-adf2-3a8bc623b0ba` | **Student** | Rendered clean CV export preview with standardized placement formatting, PDF print, and Word DOCX export | ✅ Success |
| `22-resume-review.png` | `/resume/review` | **SPC** | Placement Committee CV review workbench for inline bullet comments and feedback verification | ✅ Success |
| `23-admin-users.png` | `/admin/users` | **Admin** | User management console for approving pending recruiters, toggling accounts, and managing role assignments | ✅ Success |
| `24-admin-roles.png` | `/admin/roles` | **Admin** | Role-based access control matrix with custom role creation, cloning, and granular permission set bundles | ✅ Success |
| `25-admin-roster.png` | `/admin/roster` | **Admin** | Batch season setup and student roster profile sheet verification and import tool | ✅ Success |
| `26-admin-audit-log.png` | `/admin/audit-log` | **Admin** | Immutable security audit log tracing sensitive events, approvals, overrides, and permission modifications | ✅ Success |

*Captured with Playwright Chromium at 1440x900 viewport in dark theme mode.*
