// Hand-authored domain types mirroring supabase/migrations/0001_initial_schema.sql.
//
// These are NOT the Supabase-generated `Database` type. Once a real project
// is linked, run `npm run db:types` to generate
// src/types/database.types.ts and prefer that (createClient<Database>()) for
// full query type-safety — these are meant for application code (component
// props, function signatures) in the meantime.

export type UserStatus = "pending" | "active" | "deactivated";
export type PlacementStatusValue = "unplaced" | "placed";
export type PipelineStage = "prospect" | "contacted" | "interested" | "committed" | "onboarded";
export type OutreachChannel = "call" | "email";
export type MergeStatus =
  | "email_sent"
  | "email_opened"
  | "email_clicked"
  | "responded"
  | "not_interested"
  | "call_back_later"
  | "bounced";
export type JdStatus = "draft" | "published" | "applications_closed" | "shortlisting" | "closed";
export type ApplicationStatusValue =
  | "applied"
  | "under_review"
  | "shortlisted"
  | "interview"
  | "selected"
  | "rejected"
  | "waitlisted";
export type DefaultActivityType = "gl" | "summit" | "process" | "seminar";
export type CvReviewStatus = "open" | "applied" | "dismissed";

export interface Institute {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Batch {
  id: string;
  institute_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Role {
  id: string;
  institute_id: string | null; // null = system base role, shared across institutes
  name: string;
  is_base_role: boolean;
  cloned_from_role_id: string | null;
  created_at: string;
}

export interface PermissionSet {
  id: string;
  name: string;
  description: string | null;
  actions: string[];
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  institute_id: string;
  actor_user_id: string | null;
  action: string;
  target_entity: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AppUser {
  id: string;
  institute_id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  status: UserStatus;
  batch_id: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

// Sub-shapes assumed by the eligibility engine (0004_settings_functions_views.sql) —
// keep the roster importer and this in sync.
export interface GraduationDetails {
  college?: string;
  branch?: string;
  cgpa?: number;
  backlog_count?: number;
  year?: number;
}

export interface PgDetails {
  specialization?: string;
  cgpa?: number;
  year?: number;
}

export interface PriorEmployer {
  company: string;
  role?: string;
  duration_months?: number;
}

export interface Student {
  id: string;
  user_id: string | null;
  batch_id: string;
  roll_no: string;
  display_seq: number | null;
  section: string | null;
  name: string;
  age: number | null;
  gender: string | null; // masked pre-shortlist (Section 7.4) — never trust client-side unmasking
  phone: string | null; // masked pre-shortlist
  personal_email: string | null; // masked pre-shortlist
  total_work_ex_months: number;
  prior_employers: PriorEmployer[];
  graduation_details: GraduationDetails;
  pg_details: PgDetails;
  tenth_twelfth_details: Record<string, unknown>;
  credentials: unknown[];
  other_qualifications: string | null;
  placement_status: PlacementStatusValue;
  latest_cv_document_id: string | null;
  created_at: string;
  updated_at: string;
}

export type EligibilityOverrideType = "include" | "exclude";

// FR-2.5: manual add/remove of specific students from a JD's eligible list
// (0018_eligibility_overrides.sql). final_eligible_students_for_jd() applies
// these on top of the raw auto-eligibility computed by
// _eligible_student_ids_for_jd() — the two are deliberately kept separate,
// see that migration's comment.
export interface JdEligibilityOverride {
  id: string;
  jd_id: string;
  student_id: string;
  override_type: EligibilityOverrideType;
  created_by_user_id: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  institute_id: string;
  name: string;
  sector: string | null;
  pipeline_stage: PipelineStage;
  owner_user_id: string | null;
  supervisor_user_id: string | null;
  jd_form_received: boolean;
  past_hiring_history: unknown[];
  created_at: string;
  updated_at: string;
}

export interface CompanyContact {
  id: string;
  company_id: string;
  title: string | null;
  full_name: string;
  last_name: string | null;
  hr_designation: string | null;
  email: string | null;
  cc_email: string | null;
  phone: string | null;
  created_at: string;
}

export interface Jd {
  id: string;
  company_id: string;
  batch_id: string;
  created_by_user_id: string | null;
  role_title: string;
  grade: string | null;
  ctc_fixed: number | null;
  ctc_variable: number | null;
  ctc_total: number | null;
  locations: string[];
  eligible_branches: string[];
  eligible_specializations: string[];
  min_cgpa: number | null;
  max_backlog: number | null;
  unplaced_only: boolean;
  open_positions: number | null;
  jd_attachment_url: string | null;
  apply_by_deadline: string;
  status: JdStatus;
  admin_approval_required: boolean;
  created_at: string;
  updated_at: string;
}

// One entry appended per assignment by append_application_round() (FR-5.2) —
// Section 5 has no separate InterviewSlot entity, round_history is where this lives.
export interface RoundHistoryEntry {
  round: string;
  scheduled_at: string | null;
  location: string | null;
  assigned_by_user_id: string;
  assigned_at: string;
}

// Split into its own table by 0012_codex_audit_fixes.sql — RLS is row-level,
// so a `private_notes` column on `applications` was reachable by the owning
// student via their own applications_select access no matter what the UI
// hid. application_private_notes has no student-visible SELECT branch at all.
export interface ApplicationPrivateNote {
  id: string;
  application_id: string;
  author_user_id: string;
  note_text: string;
  created_at: string;
}

export interface Application {
  id: string;
  student_id: string;
  jd_id: string;
  cv_document_id: string | null;
  status: ApplicationStatusValue;
  round_history: RoundHistoryEntry[];
  applied_at: string;
  withdrawn_at: string | null;
  updated_at: string;
}

export interface CvBullet {
  id: string;
  text: string;
}

export interface CvAcademicEntry {
  id: string;
  institute: string;
  course: string;
  year: string;
  result: string;
}

export interface CvExperienceEntry {
  id: string;
  company: string;
  role: string;
  period: string;
  bullets: CvBullet[];
}

export interface CvProjectEntry {
  id: string;
  name: string;
  role: string;
  period: string;
  link: string;
  bullets: CvBullet[];
}

export interface CvJdFitAnalysis {
  jdId: string;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  sectionCoverage: Record<string, number>;
  analyzedAt: string;
}

export interface CvContent {
  title: string;
  personalInfo: {
    name: string;
    email: string;
    phone: string;
    linkedin: string;
    location: string;
    summary: string;
  };
  academics: CvAcademicEntry[];
  experience: CvExperienceEntry[];
  projects: CvProjectEntry[];
  positions: CvExperienceEntry[];
  skills: string[];
  certifications: string[];
  awards: string[];
  jdFit: CvJdFitAnalysis | null;
}

// Row shape of the `applicant_directory` view (0004_settings_functions_views.sql) —
// the ONLY thing recruiter-facing screens should query for applicant lists,
// never the raw `students` table, since this is what applies Section 7.4 masking.
export interface ApplicantDirectoryRow {
  application_id: string;
  jd_id: string;
  student_id: string;
  status: ApplicationStatusValue;
  round_history: RoundHistoryEntry[];
  applied_at: string;
  roll_no: string;
  name: string;
  total_work_ex_months: number;
  branch: string | null;
  specialization: string | null;
  cgpa: number | null;
  phone: string | null; // null unless this application is shortlisted+ (view-computed)
  personal_email: string | null;
  gender: string | null;
}

export interface DefaultRecord {
  id: string;
  student_id: string;
  activity_name: string;
  activity_type: DefaultActivityType;
  attended: boolean;
  category_total: number;
  created_at: string;
}

export interface StudentDefaultsSummaryRow {
  student_id: string;
  total_defaults: number;
  total_activities: number;
}

export interface PlacementRecord {
  id: string;
  student_id: string;
  company_id: string;
  jd_id: string | null;
  final_ctc: number | null;
  role_title: string | null;
  offer_date: string | null;
  created_at: string;
}

export interface CvDocument {
  id: string;
  student_id: string;
  persona_id: string | null;
  version_no: number;
  template_id: string;
  ats_score: number | null;
  jd_coverage_score: number | null;
  file_url: string | null;
  content: CvContent;
  is_latest: boolean;
  created_at: string;
  updated_at: string;
}

export interface CvReviewComment {
  id: string;
  cv_document_id: string;
  spc_user_id: string;
  anchor_section: string;
  anchor_bullet_id: string | null;
  comment_text: string;
  status: CvReviewStatus;
  created_at: string;
}

export interface CompanyTypePersona {
  id: string;
  category_name: string;
  template_content: string;
  created_at: string;
}

export interface OutreachActivity {
  id: string;
  company_id: string;
  contact_id: string | null;
  channel: OutreachChannel;
  call_remarks: string | null;
  spc_remarks: string | null;
  jpc_remark: string | null;
  previous_mails_summary: string | null;
  merge_status: MergeStatus | null;
  logged_by_user_id: string | null;
  logged_by_name: string | null;
  occurred_at: string;
  created_at: string;
}

// Row shape of the `spc_pipeline_overview` view (0007_spc_coordination.sql).
// Only meaningful for a caller with Shortlist Oversight/JD Management — see
// that view's own comment for why (security_invoker + per-caller RLS on the
// subqueries means anyone else gets undercounted, not wrong-but-safe, numbers).
export interface SpcPipelineRow {
  jd_id: string;
  role_title: string;
  jd_status: JdStatus;
  jd_updated_at: string;
  company_id: string;
  company_name: string;
  shortlisted_count: number;
  total_applications: number;
  is_stale: boolean;
}

// Base role names seeded in 0003_seed_reference_data.sql. Custom roles
// (e.g. "Senior SPC") are additional `roles` rows, not additional values here.
export const BASE_ROLE_NAMES = ["Admin", "SPC", "BD", "Recruiter", "Student"] as const;
export type BaseRoleName = (typeof BASE_ROLE_NAMES)[number];
