// Transitional generated-schema extension for migration 0027. Regenerate
// database.types.ts after 0027 is applied, then collapse this alias to
// Database without changing query call sites (same pattern as
// notification-database.ts for 0019).
import type { Database, Json } from "@/types/database.types";

export type FitVerdictRow = "strong" | "likely" | "partial" | "weak" | "insufficient_evidence";

export type JdFitCriteriaRow = {
  id: string;
  jd_id: string;
  version_no: number;
  criteria: Json;
  created_by_user_id: string | null;
  created_at: string;
};

export type ApplicationFitBriefRow = {
  id: string;
  application_id: string;
  criteria_id: string;
  verdict: FitVerdictRow;
  summary: string;
  must_haves: Json;
  nice_to_haves: Json;
  probes: Json;
  excluded: string[];
  model: string;
  degraded: boolean;
  generated_by_user_id: string | null;
  created_at: string;
};

export type FitBriefFeedbackRow = {
  id: string;
  brief_id: string;
  user_id: string;
  accurate: boolean;
  reason: string | null;
  created_at: string;
};

type Insertable<T> = Partial<T> & Record<string, unknown>;

export type FitDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Database["public"]["Tables"] & {
      jd_fit_criteria: {
        Row: JdFitCriteriaRow;
        Insert: Insertable<JdFitCriteriaRow>;
        Update: Insertable<JdFitCriteriaRow>;
        Relationships: [];
      };
      application_fit_briefs: {
        Row: ApplicationFitBriefRow;
        Insert: Insertable<ApplicationFitBriefRow>;
        Update: Insertable<ApplicationFitBriefRow>;
        Relationships: [];
      };
      fit_brief_feedback: {
        Row: FitBriefFeedbackRow;
        Insert: Insertable<FitBriefFeedbackRow>;
        Update: Insertable<FitBriefFeedbackRow>;
        Relationships: [];
      };
    };
    Functions: Database["public"]["Functions"] & {
      get_fit_input: { Args: { p_application_id: string }; Returns: Json };
      fit_verdict_distribution: {
        Args: { p_jd_id: string };
        Returns: { criteria_version: number; verdict: FitVerdictRow; brief_count: number }[];
      };
    };
  };
};
