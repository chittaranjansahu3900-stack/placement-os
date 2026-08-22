export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      application_private_notes: {
        Row: {
          application_id: string
          author_user_id: string
          created_at: string
          id: string
          note_text: string
        }
        Insert: {
          application_id: string
          author_user_id: string
          created_at?: string
          id?: string
          note_text: string
        }
        Update: {
          application_id?: string
          author_user_id?: string
          created_at?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_private_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applicant_directory"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_private_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_private_notes_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          applied_at: string
          cv_document_id: string | null
          id: string
          jd_id: string
          round_history: Json
          status: Database["public"]["Enums"]["application_status"]
          student_id: string
          updated_at: string
          withdrawn_at: string | null
        }
        Insert: {
          applied_at?: string
          cv_document_id?: string | null
          id?: string
          jd_id: string
          round_history?: Json
          status?: Database["public"]["Enums"]["application_status"]
          student_id: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Update: {
          applied_at?: string
          cv_document_id?: string | null
          id?: string
          jd_id?: string
          round_history?: Json
          status?: Database["public"]["Enums"]["application_status"]
          student_id?: string
          updated_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_cv_document_id_fkey"
            columns: ["cv_document_id"]
            isOneToOne: false
            referencedRelation: "cv_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "jds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["jd_id"]
          },
          {
            foreignKeyName: "applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log_entries: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          institute_id: string
          metadata: Json
          target_entity: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          institute_id: string
          metadata?: Json
          target_entity: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          institute_id?: string
          metadata?: Json
          target_entity?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_entries_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_entries_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          ends_on: string | null
          id: string
          institute_id: string
          is_active: boolean
          name: string
          starts_on: string | null
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          id?: string
          institute_id: string
          is_active?: boolean
          name: string
          starts_on?: string | null
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          id?: string
          institute_id?: string
          is_active?: boolean
          name?: string
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_vault_files: {
        Row: {
          company_id: string | null
          created_at: string
          file_path: string
          id: string
          institute_id: string
          mime_type: string
          original_name: string
          size_bytes: number
          uploaded_by_user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          file_path: string
          id?: string
          institute_id: string
          mime_type: string
          original_name: string
          size_bytes: number
          uploaded_by_user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          file_path?: string
          id?: string
          institute_id?: string
          mime_type?: string
          original_name?: string
          size_bytes?: number
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "committee_vault_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_vault_files_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "committee_vault_files_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_vault_files_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          institute_id: string
          jd_form_received: boolean
          name: string
          owner_user_id: string | null
          past_hiring_history: Json
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          sector: string | null
          supervisor_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          institute_id: string
          jd_form_received?: boolean
          name: string
          owner_user_id?: string | null
          past_hiring_history?: Json
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          sector?: string | null
          supervisor_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          institute_id?: string
          jd_form_received?: boolean
          name?: string
          owner_user_id?: string | null
          past_hiring_history?: Json
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          sector?: string | null
          supervisor_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_supervisor_user_id_fkey"
            columns: ["supervisor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_contacts: {
        Row: {
          cc_email: string | null
          company_id: string
          created_at: string
          email: string | null
          full_name: string
          hr_designation: string | null
          id: string
          last_name: string | null
          phone: string | null
          title: string | null
        }
        Insert: {
          cc_email?: string | null
          company_id: string
          created_at?: string
          email?: string | null
          full_name: string
          hr_designation?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          title?: string | null
        }
        Update: {
          cc_email?: string | null
          company_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          hr_designation?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["company_id"]
          },
        ]
      }
      company_type_personas: {
        Row: {
          category_name: string
          created_at: string
          id: string
          template_content: string
        }
        Insert: {
          category_name: string
          created_at?: string
          id?: string
          template_content?: string
        }
        Update: {
          category_name?: string
          created_at?: string
          id?: string
          template_content?: string
        }
        Relationships: []
      }
      cv_documents: {
        Row: {
          ats_score: number | null
          content: Json
          created_at: string
          file_url: string | null
          id: string
          is_latest: boolean
          jd_coverage_score: number | null
          persona_id: string | null
          student_id: string
          template_id: string
          updated_at: string
          version_no: number
        }
        Insert: {
          ats_score?: number | null
          content?: Json
          created_at?: string
          file_url?: string | null
          id?: string
          is_latest?: boolean
          jd_coverage_score?: number | null
          persona_id?: string | null
          student_id: string
          template_id?: string
          updated_at?: string
          version_no?: number
        }
        Update: {
          ats_score?: number | null
          content?: Json
          created_at?: string
          file_url?: string | null
          id?: string
          is_latest?: boolean
          jd_coverage_score?: number | null
          persona_id?: string | null
          student_id?: string
          template_id?: string
          updated_at?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "cv_documents_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "company_type_personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cv_documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_review_comments: {
        Row: {
          anchor_bullet_id: string | null
          anchor_section: string
          comment_text: string
          created_at: string
          cv_document_id: string
          id: string
          spc_user_id: string
          status: Database["public"]["Enums"]["cv_review_status"]
        }
        Insert: {
          anchor_bullet_id?: string | null
          anchor_section: string
          comment_text: string
          created_at?: string
          cv_document_id: string
          id?: string
          spc_user_id: string
          status?: Database["public"]["Enums"]["cv_review_status"]
        }
        Update: {
          anchor_bullet_id?: string | null
          anchor_section?: string
          comment_text?: string
          created_at?: string
          cv_document_id?: string
          id?: string
          spc_user_id?: string
          status?: Database["public"]["Enums"]["cv_review_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cv_review_comments_cv_document_id_fkey"
            columns: ["cv_document_id"]
            isOneToOne: false
            referencedRelation: "cv_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cv_review_comments_spc_user_id_fkey"
            columns: ["spc_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      default_records: {
        Row: {
          activity_name: string
          activity_type: Database["public"]["Enums"]["default_activity_type"]
          attended: boolean
          category_total: number
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          activity_name: string
          activity_type: Database["public"]["Enums"]["default_activity_type"]
          attended?: boolean
          category_total?: number
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          activity_name?: string
          activity_type?: Database["public"]["Enums"]["default_activity_type"]
          attended?: boolean
          category_total?: number
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "default_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      field_visibility_rules: {
        Row: {
          applies_to_permission_set_id: string | null
          created_at: string
          entity: string
          field: string
          id: string
          unlock_condition: string
        }
        Insert: {
          applies_to_permission_set_id?: string | null
          created_at?: string
          entity: string
          field: string
          id?: string
          unlock_condition: string
        }
        Update: {
          applies_to_permission_set_id?: string | null
          created_at?: string
          entity?: string
          field?: string
          id?: string
          unlock_condition?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_visibility_rules_applies_to_permission_set_id_fkey"
            columns: ["applies_to_permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      institute_settings: {
        Row: {
          created_at: string
          defaults_threshold: number
          institute_id: string
          staleness_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          defaults_threshold?: number
          institute_id: string
          staleness_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          defaults_threshold?: number
          institute_id?: string
          staleness_days?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "institute_settings_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: true
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
        ]
      }
      institutes: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      jd_eligibility_overrides: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          id: string
          jd_id: string
          override_type: Database["public"]["Enums"]["eligibility_override_type"]
          student_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          jd_id: string
          override_type: Database["public"]["Enums"]["eligibility_override_type"]
          student_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          jd_id?: string
          override_type?: Database["public"]["Enums"]["eligibility_override_type"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jd_eligibility_overrides_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jd_eligibility_overrides_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "jds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jd_eligibility_overrides_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["jd_id"]
          },
          {
            foreignKeyName: "jd_eligibility_overrides_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      jd_notifications: {
        Row: {
          id: string
          jd_id: string
          opened_at: string | null
          sent_at: string
          student_id: string
        }
        Insert: {
          id?: string
          jd_id: string
          opened_at?: string | null
          sent_at?: string
          student_id: string
        }
        Update: {
          id?: string
          jd_id?: string
          opened_at?: string | null
          sent_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jd_notifications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "jds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jd_notifications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["jd_id"]
          },
          {
            foreignKeyName: "jd_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      jds: {
        Row: {
          admin_approval_required: boolean
          apply_by_deadline: string
          batch_id: string
          company_id: string
          created_at: string
          created_by_user_id: string | null
          ctc_fixed: number | null
          ctc_total: number | null
          ctc_variable: number | null
          eligible_branches: string[]
          eligible_specializations: string[]
          grade: string | null
          id: string
          jd_attachment_url: string | null
          locations: string[]
          max_backlog: number | null
          min_cgpa: number | null
          open_positions: number | null
          role_title: string
          spc_released_at: string | null
          spc_released_by_user_id: string | null
          spc_review_submitted_at: string | null
          spc_review_submitted_by_user_id: string | null
          status: Database["public"]["Enums"]["jd_status"]
          unplaced_only: boolean
          updated_at: string
        }
        Insert: {
          admin_approval_required?: boolean
          apply_by_deadline: string
          batch_id: string
          company_id: string
          created_at?: string
          created_by_user_id?: string | null
          ctc_fixed?: number | null
          ctc_total?: number | null
          ctc_variable?: number | null
          eligible_branches?: string[]
          eligible_specializations?: string[]
          grade?: string | null
          id?: string
          jd_attachment_url?: string | null
          locations?: string[]
          max_backlog?: number | null
          min_cgpa?: number | null
          open_positions?: number | null
          role_title: string
          spc_released_at?: string | null
          spc_released_by_user_id?: string | null
          spc_review_submitted_at?: string | null
          spc_review_submitted_by_user_id?: string | null
          status?: Database["public"]["Enums"]["jd_status"]
          unplaced_only?: boolean
          updated_at?: string
        }
        Update: {
          admin_approval_required?: boolean
          apply_by_deadline?: string
          batch_id?: string
          company_id?: string
          created_at?: string
          created_by_user_id?: string | null
          ctc_fixed?: number | null
          ctc_total?: number | null
          ctc_variable?: number | null
          eligible_branches?: string[]
          eligible_specializations?: string[]
          grade?: string | null
          id?: string
          jd_attachment_url?: string | null
          locations?: string[]
          max_backlog?: number | null
          min_cgpa?: number | null
          open_positions?: number | null
          role_title?: string
          spc_released_at?: string | null
          spc_released_by_user_id?: string | null
          spc_review_submitted_at?: string | null
          spc_review_submitted_by_user_id?: string | null
          status?: Database["public"]["Enums"]["jd_status"]
          unplaced_only?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jds_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jds_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "jds_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jds_spc_released_by_user_id_fkey"
            columns: ["spc_released_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jds_spc_review_submitted_by_user_id_fkey"
            columns: ["spc_review_submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_jobs: {
        Row: {
          application_id: string | null
          attempt_count: number
          bounced_at: string | null
          cc_emails: string[]
          clicked_at: string | null
          created_at: string
          created_by_user_id: string | null
          delivered_at: string | null
          html_body: string
          id: string
          idempotency_key: string
          institute_id: string
          jd_notification_id: string | null
          kind: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          opened_at: string | null
          outreach_activity_id: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
          tags: Json
          text_body: string
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          attempt_count?: number
          bounced_at?: string | null
          cc_emails?: string[]
          clicked_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          delivered_at?: string | null
          html_body: string
          id?: string
          idempotency_key: string
          institute_id: string
          jd_notification_id?: string | null
          kind: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          opened_at?: string | null
          outreach_activity_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject: string
          tags?: Json
          text_body: string
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          attempt_count?: number
          bounced_at?: string | null
          cc_emails?: string[]
          clicked_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          delivered_at?: string | null
          html_body?: string
          id?: string
          idempotency_key?: string
          institute_id?: string
          jd_notification_id?: string | null
          kind?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          opened_at?: string | null
          outreach_activity_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string
          tags?: Json
          text_body?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_jobs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applicant_directory"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "notification_jobs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_jd_notification_id_fkey"
            columns: ["jd_notification_id"]
            isOneToOne: false
            referencedRelation: "jd_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_jobs_outreach_activity_id_fkey"
            columns: ["outreach_activity_id"]
            isOneToOne: false
            referencedRelation: "outreach_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_webhook_events: {
        Row: {
          event_created_at: string
          event_type: string
          id: string
          provider_message_id: string | null
          received_at: string
          svix_id: string
        }
        Insert: {
          event_created_at: string
          event_type: string
          id?: string
          provider_message_id?: string | null
          received_at?: string
          svix_id: string
        }
        Update: {
          event_created_at?: string
          event_type?: string
          id?: string
          provider_message_id?: string | null
          received_at?: string
          svix_id?: string
        }
        Relationships: []
      }
      outreach_activities: {
        Row: {
          batch_id: string | null
          call_remarks: string | null
          channel: Database["public"]["Enums"]["outreach_channel"]
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          jpc_remark: string | null
          logged_by_name: string | null
          logged_by_user_id: string | null
          merge_status: Database["public"]["Enums"]["merge_status"] | null
          occurred_at: string
          previous_mails_summary: string | null
          spc_remarks: string | null
        }
        Insert: {
          batch_id?: string | null
          call_remarks?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          jpc_remark?: string | null
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          merge_status?: Database["public"]["Enums"]["merge_status"] | null
          occurred_at?: string
          previous_mails_summary?: string | null
          spc_remarks?: string | null
        }
        Update: {
          batch_id?: string | null
          call_remarks?: string | null
          channel?: Database["public"]["Enums"]["outreach_channel"]
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          jpc_remark?: string | null
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          merge_status?: Database["public"]["Enums"]["merge_status"] | null
          occurred_at?: string
          previous_mails_summary?: string | null
          spc_remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_activities_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "outreach_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "company_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_activities_logged_by_user_id_fkey"
            columns: ["logged_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_sets: {
        Row: {
          actions: Json
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          actions?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      placement_records: {
        Row: {
          company_id: string
          created_at: string
          final_ctc: number | null
          id: string
          jd_id: string | null
          offer_date: string | null
          role_title: string | null
          student_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          final_ctc?: number | null
          id?: string
          jd_id?: string | null
          offer_date?: string | null
          role_title?: string | null
          student_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          final_ctc?: number | null
          id?: string
          jd_id?: string | null
          offer_date?: string | null
          role_title?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "placement_records_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "jds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_records_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["jd_id"]
          },
          {
            foreignKeyName: "placement_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission_sets: {
        Row: {
          permission_set_id: string
          role_id: string
        }
        Insert: {
          permission_set_id: string
          role_id: string
        }
        Update: {
          permission_set_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_sets_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_sets_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          cloned_from_role_id: string | null
          created_at: string
          id: string
          institute_id: string | null
          is_base_role: boolean
          name: string
        }
        Insert: {
          cloned_from_role_id?: string | null
          created_at?: string
          id?: string
          institute_id?: string | null
          is_base_role?: boolean
          name: string
        }
        Update: {
          cloned_from_role_id?: string | null
          created_at?: string
          id?: string
          institute_id?: string | null
          is_base_role?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_cloned_from_role_id_fkey"
            columns: ["cloned_from_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          age: number | null
          batch_id: string
          created_at: string
          credentials: Json
          display_seq: number | null
          gender: string | null
          graduation_details: Json
          id: string
          latest_cv_document_id: string | null
          name: string
          other_qualifications: string | null
          personal_email: string | null
          pg_details: Json
          phone: string | null
          placement_status: Database["public"]["Enums"]["placement_status"]
          prior_employers: Json
          roll_no: string
          section: string | null
          tenth_twelfth_details: Json
          total_work_ex_months: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          age?: number | null
          batch_id: string
          created_at?: string
          credentials?: Json
          display_seq?: number | null
          gender?: string | null
          graduation_details?: Json
          id?: string
          latest_cv_document_id?: string | null
          name: string
          other_qualifications?: string | null
          personal_email?: string | null
          pg_details?: Json
          phone?: string | null
          placement_status?: Database["public"]["Enums"]["placement_status"]
          prior_employers?: Json
          roll_no: string
          section?: string | null
          tenth_twelfth_details?: Json
          total_work_ex_months?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          age?: number | null
          batch_id?: string
          created_at?: string
          credentials?: Json
          display_seq?: number | null
          gender?: string | null
          graduation_details?: Json
          id?: string
          latest_cv_document_id?: string | null
          name?: string
          other_qualifications?: string | null
          personal_email?: string | null
          pg_details?: Json
          phone?: string | null
          placement_status?: Database["public"]["Enums"]["placement_status"]
          prior_employers?: Json
          roll_no?: string
          section?: string | null
          tenth_twelfth_details?: Json
          total_work_ex_months?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_latest_cv_fk"
            columns: ["latest_cv_document_id"]
            isOneToOne: false
            referencedRelation: "cv_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_sets: {
        Row: {
          permission_set_id: string
          user_id: string
        }
        Insert: {
          permission_set_id: string
          user_id: string
        }
        Update: {
          permission_set_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_sets_permission_set_id_fkey"
            columns: ["permission_set_id"]
            isOneToOne: false
            referencedRelation: "permission_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role_id: string
          user_id: string
        }
        Insert: {
          role_id: string
          user_id: string
        }
        Update: {
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          batch_id: string | null
          company_id: string | null
          created_at: string
          email: string
          id: string
          institute_id: string
          name: string
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          batch_id?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          id?: string
          institute_id: string
          name: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          batch_id?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          id?: string
          institute_id?: string
          name?: string
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "users_institute_id_fkey"
            columns: ["institute_id"]
            isOneToOne: false
            referencedRelation: "institutes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      applicant_directory: {
        Row: {
          application_id: string | null
          applied_at: string | null
          branch: string | null
          cgpa: number | null
          gender: string | null
          jd_id: string | null
          name: string | null
          personal_email: string | null
          phone: string | null
          roll_no: string | null
          round_history: Json | null
          specialization: string | null
          status: Database["public"]["Enums"]["application_status"] | null
          student_id: string | null
          total_work_ex_months: number | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "jds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_jd_id_fkey"
            columns: ["jd_id"]
            isOneToOne: false
            referencedRelation: "spc_pipeline_overview"
            referencedColumns: ["jd_id"]
          },
          {
            foreignKeyName: "applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      spc_pipeline_overview: {
        Row: {
          company_id: string | null
          company_name: string | null
          is_stale: boolean | null
          jd_id: string | null
          jd_status: Database["public"]["Enums"]["jd_status"] | null
          jd_updated_at: string | null
          role_title: string | null
          shortlisted_count: number | null
          total_applications: number | null
        }
        Relationships: []
      }
      student_defaults_summary: {
        Row: {
          student_id: string | null
          total_activities: number | null
          total_defaults: number | null
        }
        Relationships: [
          {
            foreignKeyName: "default_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _eligible_student_ids_for_jd: {
        Args: { p_jd_id: string }
        Returns: {
          student_id: string
        }[]
      }
      _jd_is_visible_to_caller: { Args: { p_jd_id: string }; Returns: boolean }
      append_application_round: {
        Args: { p_application_id: string; p_round_entry: Json }
        Returns: undefined
      }
      bulk_update_application_status: {
        Args: {
          p_application_ids: string[]
          p_jd_id: string
          p_round_label?: string
          p_status: Database["public"]["Enums"]["application_status"]
        }
        Returns: number
      }
      current_company_id: { Args: never; Returns: string }
      current_institute_id: { Args: never; Returns: string }
      current_student_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      eligible_student_count_for_jd: {
        Args: { p_jd_id: string }
        Returns: number
      }
      eligible_students_for_jd: {
        Args: { p_jd_id: string }
        Returns: {
          age: number | null
          batch_id: string
          created_at: string
          credentials: Json
          display_seq: number | null
          gender: string | null
          graduation_details: Json
          id: string
          latest_cv_document_id: string | null
          name: string
          other_qualifications: string | null
          personal_email: string | null
          pg_details: Json
          phone: string | null
          placement_status: Database["public"]["Enums"]["placement_status"]
          prior_employers: Json
          roll_no: string
          section: string | null
          tenth_twelfth_details: Json
          total_work_ex_months: number
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      final_eligible_student_count_for_jd: {
        Args: { p_jd_id: string }
        Returns: number
      }
      final_eligible_student_ids_for_jd: {
        Args: { p_jd_id: string }
        Returns: {
          student_id: string
        }[]
      }
      final_eligible_students_for_jd: {
        Args: { p_jd_id: string }
        Returns: {
          age: number | null
          batch_id: string
          created_at: string
          credentials: Json
          display_seq: number | null
          gender: string | null
          graduation_details: Json
          id: string
          latest_cv_document_id: string | null
          name: string
          other_qualifications: string | null
          personal_email: string | null
          pg_details: Json
          phone: string | null
          placement_status: Database["public"]["Enums"]["placement_status"]
          prior_employers: Json
          roll_no: string
          section: string | null
          tenth_twelfth_details: Json
          total_work_ex_months: number
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_candidate_packets: {
        Args: { p_application_ids: string[] }
        Returns: {
          application_id: string
          cv_document: Json
          student: Json
        }[]
      }
      get_placement_export_dataset: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      has_permission: { Args: { perm_name: string }; Returns: boolean }
      has_role: { Args: { role_name: string }; Returns: boolean }
      log_audit_event: {
        Args: {
          p_action: string
          p_metadata?: Json
          p_target_entity: string
          p_target_id: string
        }
        Returns: undefined
      }
      my_eligibility_for_jd: { Args: { p_jd_id: string }; Returns: Json }
      release_jd_to_batch: {
        Args: { p_apply_by_deadline?: string; p_jd_id: string }
        Returns: undefined
      }
      user_has_role_lineage: {
        Args: { p_role_names: string[]; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      application_status:
        | "applied"
        | "under_review"
        | "shortlisted"
        | "interview"
        | "selected"
        | "rejected"
        | "waitlisted"
      cv_review_status: "open" | "applied" | "dismissed"
      default_activity_type: "gl" | "summit" | "process" | "seminar"
      eligibility_override_type: "include" | "exclude"
      jd_status:
        | "draft"
        | "published"
        | "applications_closed"
        | "shortlisting"
        | "closed"
      merge_status:
        | "email_sent"
        | "email_opened"
        | "email_clicked"
        | "responded"
        | "not_interested"
        | "call_back_later"
        | "bounced"
      outreach_channel: "call" | "email"
      pipeline_stage:
        | "prospect"
        | "contacted"
        | "interested"
        | "committed"
        | "onboarded"
      placement_status: "unplaced" | "placed"
      user_status: "pending" | "active" | "deactivated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_status: [
        "applied",
        "under_review",
        "shortlisted",
        "interview",
        "selected",
        "rejected",
        "waitlisted",
      ],
      cv_review_status: ["open", "applied", "dismissed"],
      default_activity_type: ["gl", "summit", "process", "seminar"],
      eligibility_override_type: ["include", "exclude"],
      jd_status: [
        "draft",
        "published",
        "applications_closed",
        "shortlisting",
        "closed",
      ],
      merge_status: [
        "email_sent",
        "email_opened",
        "email_clicked",
        "responded",
        "not_interested",
        "call_back_later",
        "bounced",
      ],
      outreach_channel: ["call", "email"],
      pipeline_stage: [
        "prospect",
        "contacted",
        "interested",
        "committed",
        "onboarded",
      ],
      placement_status: ["unplaced", "placed"],
      user_status: ["pending", "active", "deactivated"],
    },
  },
} as const
