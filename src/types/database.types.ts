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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_year_checks: {
        Row: {
          academic_year_id: string
          check_key: string
          confirmed_at: string
          confirmed_by: string | null
          done: boolean
          note: string | null
        }
        ComputedFields: never
        Insert: {
          academic_year_id: string
          check_key: string
          confirmed_at?: string
          confirmed_by?: string | null
          done?: boolean
          note?: string | null
        }
        Update: {
          academic_year_id?: string
          check_key?: string
          confirmed_at?: string
          confirmed_by?: string | null
          done?: boolean
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "academic_year_checks_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      academic_years: {
        Row: {
          created_at: string
          created_by: string | null
          ends_on: string
          handover_starts_on: string | null
          id: string
          label: string
          mandate_ends_at: string
          mandate_starts_at: string
          notes: string | null
          recruitment_closes_on: string | null
          recruitment_opens_on: string | null
          reminder_offsets: number[]
          rolled_over_at: string | null
          rolled_over_by: string | null
          starts_on: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_on: string
          handover_starts_on?: string | null
          id?: string
          label: string
          mandate_ends_at: string
          mandate_starts_at: string
          notes?: string | null
          recruitment_closes_on?: string | null
          recruitment_opens_on?: string | null
          reminder_offsets?: number[]
          rolled_over_at?: string | null
          rolled_over_by?: string | null
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_on?: string
          handover_starts_on?: string | null
          id?: string
          label?: string
          mandate_ends_at?: string
          mandate_starts_at?: string
          notes?: string | null
          recruitment_closes_on?: string | null
          recruitment_opens_on?: string | null
          reminder_offsets?: number[]
          rolled_over_at?: string | null
          rolled_over_by?: string | null
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      application_access_log: {
        Row: {
          action: string
          actor_id: string
          application_id: string
          campaign_id: string
          document_id: string | null
          id: number
          occurred_at: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id: string
          application_id: string
          campaign_id: string
          document_id?: string | null
          id?: never
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_id?: string
          application_id?: string
          campaign_id?: string
          document_id?: string | null
          id?: never
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_access_log_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_activity: {
        Row: {
          action: string
          actor_id: string | null
          application_id: string
          campaign_id: string
          details: Json
          id: number
          occurred_at: string
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_id?: string | null
          application_id: string
          campaign_id: string
          details?: Json
          id?: never
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          application_id?: string
          campaign_id?: string
          details?: Json
          id?: never
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_activity_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_comments: {
        Row: {
          application_id: string
          author_id: string
          body: string
          campaign_id: string
          created_at: string
          id: string
          mentions: string[]
          retracted_at: string | null
        }
        ComputedFields: never
        Insert: {
          application_id: string
          author_id: string
          body: string
          campaign_id: string
          created_at?: string
          id?: string
          mentions?: string[]
          retracted_at?: string | null
        }
        Update: {
          application_id?: string
          author_id?: string
          body?: string
          campaign_id?: string
          created_at?: string
          id?: string
          mentions?: string[]
          retracted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_comments_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      application_documents: {
        Row: {
          application_id: string
          clarification_id: string | null
          confirmed_at: string | null
          created_at: string
          file_name: string
          id: string
          mime_type: string
          object_path: string
          question_id: string
          removed_at: string | null
          size_bytes: number
          status: string
        }
        ComputedFields: never
        Insert: {
          application_id: string
          clarification_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          object_path: string
          question_id: string
          removed_at?: string | null
          size_bytes: number
          status?: string
        }
        Update: {
          application_id?: string
          clarification_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          object_path?: string
          question_id?: string
          removed_at?: string | null
          size_bytes?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_documents_clarification_id_fkey"
            columns: ["clarification_id"]
            isOneToOne: false
            referencedRelation: "recruitment_clarifications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_events: {
        Row: {
          action: string
          application_id: string
          details: Json
          id: number
          occurred_at: string
        }
        ComputedFields: never
        Insert: {
          action: string
          application_id: string
          details?: Json
          id?: never
          occurred_at?: string
        }
        Update: {
          action?: string
          application_id?: string
          details?: Json
          id?: never
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      application_pipeline: {
        Row: {
          application_id: string
          campaign_id: string
          created_at: string
          position_id: string
          stage: string
          stage_changed_at: string
          stage_changed_by: string | null
          updated_at: string
          version: number
        }
        ComputedFields: never
        Insert: {
          application_id: string
          campaign_id: string
          created_at?: string
          position_id: string
          stage?: string
          stage_changed_at?: string
          stage_changed_by?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          application_id?: string
          campaign_id?: string
          created_at?: string
          position_id?: string
          stage?: string
          stage_changed_at?: string
          stage_changed_by?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "application_pipeline_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "application_pipeline_position_fkey"
            columns: ["position_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_positions"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      application_tags: {
        Row: {
          added_at: string
          added_by: string | null
          application_id: string
          campaign_id: string
          tag_id: string
        }
        ComputedFields: never
        Insert: {
          added_at?: string
          added_by?: string | null
          application_id: string
          campaign_id: string
          tag_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          application_id?: string
          campaign_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_tags_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "application_tags_tag_fkey"
            columns: ["tag_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_tags"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      applications: {
        Row: {
          answers: Json
          campaign_id: string
          candidate_id: string
          candidate_snapshot: Json | null
          created_at: string
          form_version_id: string
          id: string
          last_saved_at: string | null
          position_id: string
          privacy_acknowledged_at: string | null
          reference: string
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
          withdrawal_reason: string | null
          withdrawn_at: string | null
        }
        ComputedFields: never
        Insert: {
          answers?: Json
          campaign_id: string
          candidate_id: string
          candidate_snapshot?: Json | null
          created_at?: string
          form_version_id: string
          id?: string
          last_saved_at?: string | null
          position_id: string
          privacy_acknowledged_at?: string | null
          reference?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          answers?: Json
          campaign_id?: string
          candidate_id?: string
          candidate_snapshot?: Json | null
          created_at?: string
          form_version_id?: string
          id?: string
          last_saved_at?: string | null
          position_id?: string
          privacy_acknowledged_at?: string | null
          reference?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "recruitment_form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "recruitment_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      association_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      association_gallery_items: {
        Row: {
          caption: string | null
          media_id: string
          organization_id: string
          position: number
          stage: string
        }
        ComputedFields: never
        Insert: {
          caption?: string | null
          media_id: string
          organization_id: string
          position: number
          stage: string
        }
        Update: {
          caption?: string | null
          media_id?: string
          organization_id?: string
          position?: number
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_gallery_items_media_fkey"
            columns: ["organization_id", "media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "association_gallery_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      association_media: {
        Row: {
          alt_text: string | null
          bytes: number
          created_at: string
          created_by: string | null
          height: number
          id: string
          kind: string
          object_path: string
          organization_id: string
          removed_at: string | null
          removed_by: string | null
          width: number
        }
        ComputedFields: never
        Insert: {
          alt_text?: string | null
          bytes: number
          created_at?: string
          created_by?: string | null
          height: number
          id: string
          kind: string
          object_path: string
          organization_id: string
          removed_at?: string | null
          removed_by?: string | null
          width: number
        }
        Update: {
          alt_text?: string | null
          bytes?: number
          created_at?: string
          created_by?: string | null
          height?: number
          id?: string
          kind?: string
          object_path?: string
          organization_id?: string
          removed_at?: string | null
          removed_by?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "association_media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      association_pages: {
        Row: {
          first_published_at: string | null
          organization_id: string
          published_at: string | null
          published_by: string | null
          published_revision: number | null
          status: string
          unpublished_at: string | null
          updated_at: string
          withheld_at: string | null
          withheld_by: string | null
          withheld_reason: string | null
        }
        ComputedFields: never
        Insert: {
          first_published_at?: string | null
          organization_id: string
          published_at?: string | null
          published_by?: string | null
          published_revision?: number | null
          status?: string
          unpublished_at?: string | null
          updated_at?: string
          withheld_at?: string | null
          withheld_by?: string | null
          withheld_reason?: string | null
        }
        Update: {
          first_published_at?: string | null
          organization_id?: string
          published_at?: string | null
          published_by?: string | null
          published_revision?: number | null
          status?: string
          unpublished_at?: string | null
          updated_at?: string
          withheld_at?: string | null
          withheld_by?: string | null
          withheld_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "association_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      association_profiles: {
        Row: {
          accent: string | null
          category_ids: string[]
          contact_email: string | null
          cover_focal: string | null
          cover_media_id: string | null
          description: string | null
          founded_year: number | null
          kind_label: string | null
          logo_media_id: string | null
          meeting_info: string | null
          name: string | null
          organization_id: string
          pillars: Json
          revision: number
          short_name: string | null
          social_links: Json
          stage: string
          tagline: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          accent?: string | null
          category_ids?: string[]
          contact_email?: string | null
          cover_focal?: string | null
          cover_media_id?: string | null
          description?: string | null
          founded_year?: number | null
          kind_label?: string | null
          logo_media_id?: string | null
          meeting_info?: string | null
          name?: string | null
          organization_id: string
          pillars?: Json
          revision?: number
          short_name?: string | null
          social_links?: Json
          stage: string
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accent?: string | null
          category_ids?: string[]
          contact_email?: string | null
          cover_focal?: string | null
          cover_media_id?: string | null
          description?: string | null
          founded_year?: number | null
          kind_label?: string | null
          logo_media_id?: string | null
          meeting_info?: string | null
          name?: string | null
          organization_id?: string
          pillars?: Json
          revision?: number
          short_name?: string | null
          social_links?: Json
          stage?: string
          tagline?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "association_profiles_cover_fkey"
            columns: ["organization_id", "cover_media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "association_profiles_logo_fkey"
            columns: ["organization_id", "logo_media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "association_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      association_team_entries: {
        Row: {
          display_title: string | null
          hidden: boolean
          membership_id: string
          organization_id: string
          position: number
          stage: string
        }
        ComputedFields: never
        Insert: {
          display_title?: string | null
          hidden?: boolean
          membership_id: string
          organization_id: string
          position: number
          stage: string
        }
        Update: {
          display_title?: string | null
          hidden?: boolean
          membership_id?: string
          organization_id?: string
          position?: number
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "association_team_entries_membership_fkey"
            columns: ["membership_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      backup_verifications: {
        Row: {
          checked_on: string
          environment: string
          id: string
          kind: string
          method: string | null
          notes: string | null
          outcome: string
          recorded_at: string
          recorded_by: string | null
        }
        ComputedFields: never
        Insert: {
          checked_on: string
          environment: string
          id?: string
          kind: string
          method?: string | null
          notes?: string | null
          outcome: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          checked_on?: string
          environment?: string
          id?: string
          kind?: string
          method?: string | null
          notes?: string | null
          outcome?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: []
      }
      content_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          post_id: string
          reason: string
          reporter_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          post_id: string
          reason: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string
          reason?: string
          reporter_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_permissions: {
        Row: {
          delegation_id: string
          permission_key: string
        }
        ComputedFields: never
        Insert: {
          delegation_id: string
          permission_key: string
        }
        Update: {
          delegation_id?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_permissions_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      delegations: {
        Row: {
          created_at: string
          delegate_membership_id: string
          delegate_user_id: string
          delegator_user_id: string
          ends_at: string
          id: string
          organization_id: string
          reason: string
          revoked_at: string | null
          revoked_by: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          delegate_membership_id: string
          delegate_user_id: string
          delegator_user_id: string
          ends_at: string
          id?: string
          organization_id: string
          reason: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delegate_membership_id?: string
          delegate_user_id?: string
          delegator_user_id?: string
          ends_at?: string
          id?: string
          organization_id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_delegate_fkey"
            columns: [
              "delegate_membership_id",
              "organization_id",
              "delegate_user_id",
            ]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id", "user_id"]
          },
          {
            foreignKeyName: "delegations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_bookmarks: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_bookmarks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      event_coorganizers: {
        Row: {
          event_id: string
          organization_id: string
          position: number
        }
        ComputedFields: never
        Insert: {
          event_id: string
          organization_id: string
          position?: number
        }
        Update: {
          event_id?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_coorganizers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_coorganizers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          cancel_reason: string | null
          cancel_source: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          created_at: string
          event_id: string
          id: string
          kind: string
          promoted_at: string | null
          queue_position: number | null
          reference: string
          status: string
          updated_at: string
          user_id: string
          waitlisted_at: string | null
        }
        ComputedFields: never
        Insert: {
          cancel_reason?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          kind?: string
          promoted_at?: string | null
          queue_position?: number | null
          reference: string
          status: string
          updated_at?: string
          user_id: string
          waitlisted_at?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancel_source?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          kind?: string
          promoted_at?: string | null
          queue_position?: number | null
          reference?: string
          status?: string
          updated_at?: string
          user_id?: string
          waitlisted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_slug_history: {
        Row: {
          created_at: string
          event_id: string
          slug: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_id: string
          slug: string
        }
        Update: {
          created_at?: string
          event_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_slug_history_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          access_details: string | null
          address_line: string | null
          cancellation_cutoff_minutes: number
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity: number | null
          category_id: string | null
          city: string | null
          confirmed_count: number
          cover_media_id: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          external_url: string | null
          first_published_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          latitude: number | null
          location_type: string
          longitude: number | null
          online_url: string | null
          organization_id: string
          pinned_at: string | null
          pinned_by: string | null
          prominence: string
          prominence_by: string | null
          prominence_until: string | null
          publication: string
          published_at: string | null
          registration_closes_at: string | null
          registration_mode: string
          registration_opens_at: string | null
          search: unknown
          series_key: string | null
          slug: string | null
          starts_at: string | null
          status: string
          summary: string | null
          timezone: string
          title: string
          unpublished_at: string | null
          updated_at: string
          updated_by: string | null
          venue_name: string | null
          version: number
          waitlist_count: number
          waitlist_enabled: boolean
        }
        ComputedFields: never
        Insert: {
          access_details?: string | null
          address_line?: string | null
          cancellation_cutoff_minutes?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number | null
          category_id?: string | null
          city?: string | null
          confirmed_count?: number
          cover_media_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          external_url?: string | null
          first_published_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          latitude?: number | null
          location_type?: string
          longitude?: number | null
          online_url?: string | null
          organization_id: string
          pinned_at?: string | null
          pinned_by?: string | null
          prominence?: string
          prominence_by?: string | null
          prominence_until?: string | null
          publication?: string
          published_at?: string | null
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          search?: never
          series_key?: string | null
          slug?: string | null
          starts_at?: string | null
          status?: string
          summary?: string | null
          timezone?: string
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_name?: string | null
          version?: number
          waitlist_count?: number
          waitlist_enabled?: boolean
        }
        Update: {
          access_details?: string | null
          address_line?: string | null
          cancellation_cutoff_minutes?: number
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity?: number | null
          category_id?: string | null
          city?: string | null
          confirmed_count?: number
          cover_media_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          external_url?: string | null
          first_published_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          latitude?: number | null
          location_type?: string
          longitude?: number | null
          online_url?: string | null
          organization_id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          prominence?: string
          prominence_by?: string | null
          prominence_until?: string | null
          publication?: string
          published_at?: string | null
          registration_closes_at?: string | null
          registration_mode?: string
          registration_opens_at?: string | null
          search?: never
          series_key?: string | null
          slug?: string | null
          starts_at?: string | null
          status?: string
          summary?: string | null
          timezone?: string
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          venue_name?: string | null
          version?: number
          waitlist_count?: number
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          authority: string
          category: string
          details: Json
          id: number
          occurred_at: string
          organization_id: string | null
          reason: string | null
          resource_id: string | null
          resource_type: string | null
          subject_user_id: string | null
        }
        ComputedFields: never
        Insert: {
          action: string
          actor_user_id?: string | null
          authority: string
          category: string
          details?: Json
          id?: never
          occurred_at?: string
          organization_id?: string | null
          reason?: string | null
          resource_id?: string | null
          resource_type?: string | null
          subject_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          authority?: string
          category?: string
          details?: Json
          id?: never
          occurred_at?: string
          organization_id?: string | null
          reason?: string | null
          resource_id?: string | null
          resource_type?: string | null
          subject_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_issues: {
        Row: {
          audience: string
          details: Json
          escalated_at: string | null
          first_detected_at: string
          id: string
          issue_key: string
          kind: string
          last_detected_at: string
          notified_at: string | null
          organization_id: string | null
          reminders: number
          resolved_at: string | null
          severity: string
          status: string
          subject_id: string | null
          subject_user_id: string | null
        }
        ComputedFields: never
        Insert: {
          audience: string
          details?: Json
          escalated_at?: string | null
          first_detected_at?: string
          id?: string
          issue_key: string
          kind: string
          last_detected_at?: string
          notified_at?: string | null
          organization_id?: string | null
          reminders?: number
          resolved_at?: string | null
          severity: string
          status?: string
          subject_id?: string | null
          subject_user_id?: string | null
        }
        Update: {
          audience?: string
          details?: Json
          escalated_at?: string | null
          first_detected_at?: string
          id?: string
          issue_key?: string
          kind?: string
          last_detected_at?: string
          notified_at?: string | null
          organization_id?: string | null
          reminders?: number
          resolved_at?: string | null
          severity?: string
          status?: string
          subject_id?: string | null
          subject_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_issues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_checklist_items: {
        Row: {
          academic_year_id: string
          assignee_user_id: string | null
          done: boolean
          id: string
          item_key: string
          note: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          academic_year_id: string
          assignee_user_id?: string | null
          done?: boolean
          id?: string
          item_key: string
          note?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          academic_year_id?: string
          assignee_user_id?: string | null
          done?: boolean
          id?: string
          item_key?: string
          note?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handover_checklist_items_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handover_checklist_items_item_key_fkey"
            columns: ["item_key"]
            isOneToOne: false
            referencedRelation: "handover_template_items"
            referencedColumns: ["item_key"]
          },
          {
            foreignKeyName: "handover_checklist_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      handover_template_items: {
        Row: {
          area: string
          help: string | null
          item_key: string
          label: string
          metric: string | null
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          area: string
          help?: string | null
          item_key: string
          label: string
          metric?: string | null
          sort_order: number
        }
        Update: {
          area?: string
          help?: string | null
          item_key?: string
          label?: string
          metric?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      institutional_records: {
        Row: {
          area: string
          contact: string | null
          notes: string | null
          owner: string | null
          provider: string | null
          record_key: string
          renewal_on: string | null
          sort_order: number
          status: string
          updated_at: string | null
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        ComputedFields: never
        Insert: {
          area: string
          contact?: string | null
          notes?: string | null
          owner?: string | null
          provider?: string | null
          record_key: string
          renewal_on?: string | null
          sort_order: number
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          area?: string
          contact?: string | null
          notes?: string | null
          owner?: string | null
          provider?: string | null
          record_key?: string
          renewal_on?: string | null
          sort_order?: number
          status?: string
          updated_at?: string | null
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      leadership_transition_approvals: {
        Row: {
          approved_at: string
          approver_user_id: string
          capacity: string
          transition_id: string
        }
        ComputedFields: never
        Insert: {
          approved_at?: string
          approver_user_id: string
          capacity: string
          transition_id: string
        }
        Update: {
          approved_at?: string
          approver_user_id?: string
          capacity?: string
          transition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_transition_approvals_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "leadership_transitions"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_transition_candidates: {
        Row: {
          accepted: boolean | null
          office: string
          responded_at: string | null
          transition_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          accepted?: boolean | null
          office: string
          responded_at?: string | null
          transition_id: string
          user_id: string
        }
        Update: {
          accepted?: boolean | null
          office?: string
          responded_at?: string | null
          transition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_transition_candidates_transition_id_fkey"
            columns: ["transition_id"]
            isOneToOne: false
            referencedRelation: "leadership_transitions"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_transitions: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          created_at: string
          effective_at: string
          expires_at: string
          id: string
          kind: string
          mandate_ends_at: string
          organization_id: string
          proposed_by: string
          reason: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          effective_at: string
          expires_at: string
          id?: string
          kind: string
          mandate_ends_at: string
          organization_id: string
          proposed_by: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          created_at?: string
          effective_at?: string
          expires_at?: string
          id?: string
          kind?: string
          mandate_ends_at?: string
          organization_id?: string
          proposed_by?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadership_transitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_public_profiles: {
        Row: {
          bio: string | null
          hidden: boolean
          membership_id: string
          show_photo: boolean
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          bio?: string | null
          hidden?: boolean
          membership_id: string
          show_photo?: boolean
          updated_at?: string
        }
        Update: {
          bio?: string | null
          hidden?: boolean
          membership_id?: string
          show_photo?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_public_profiles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          joined_at: string
          organization_id: string
          status: string
          status_reason: string | null
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          joined_at?: string
          organization_id: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          joined_at?: string
          organization_id?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_broadcast_recipients: {
        Row: {
          broadcast_id: string
          dispatched_at: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          broadcast_id: string
          dispatched_at?: string | null
          user_id: string
        }
        Update: {
          broadcast_id?: string
          dispatched_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "notification_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_broadcasts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audience: string
          body: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          dispatch_started_at: string | null
          dispatched_at: string | null
          email: boolean
          fingerprint: string
          id: string
          importance: string
          kind: string
          link_path: string | null
          needs_approval: boolean
          organization_id: string
          origin: string
          payload: Json
          recipient_count: number | null
          scheduled_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
          version: number
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audience: string
          body?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_started_at?: string | null
          dispatched_at?: string | null
          email?: boolean
          fingerprint: string
          id?: string
          importance?: string
          kind: string
          link_path?: string | null
          needs_approval?: boolean
          organization_id: string
          origin: string
          payload?: Json
          recipient_count?: number | null
          scheduled_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audience?: string
          body?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          dispatch_started_at?: string | null
          dispatched_at?: string | null
          email?: boolean
          fingerprint?: string
          id?: string
          importance?: string
          kind?: string
          link_path?: string | null
          needs_approval?: boolean
          organization_id?: string
          origin?: string
          payload?: Json
          recipient_count?: number | null
          scheduled_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_broadcasts_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "notification_broadcasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_config: {
        Row: {
          delivery_mode: string
          email_from: string | null
          id: boolean
          reply_to: string | null
          site_url: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          delivery_mode?: string
          email_from?: string | null
          id?: boolean
          reply_to?: string | null
          site_url?: string | null
          updated_at?: string
        }
        Update: {
          delivery_mode?: string
          email_from?: string | null
          id?: boolean
          reply_to?: string | null
          site_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_deliveries: {
        Row: {
          accepted_at: string | null
          attempts: number
          channel: string
          created_at: string
          delivered_at: string | null
          essential: boolean
          finished_at: string | null
          id: number
          idempotency_key: string
          last_error: string | null
          lease_until: string | null
          next_attempt_at: string
          notification_id: number
          provider: string | null
          provider_message_id: string | null
          recipient_id: string
          status: string
          topic: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          accepted_at?: string | null
          attempts?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          essential: boolean
          finished_at?: string | null
          id?: never
          idempotency_key?: string
          last_error?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          notification_id: number
          provider?: string | null
          provider_message_id?: string | null
          recipient_id: string
          status?: string
          topic: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          essential?: boolean
          finished_at?: string | null
          id?: never
          idempotency_key?: string
          last_error?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          notification_id?: number
          provider?: string | null
          provider_message_id?: string | null
          recipient_id?: string
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_topic_fkey"
            columns: ["topic"]
            isOneToOne: false
            referencedRelation: "notification_topics"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_delivery_attempts: {
        Row: {
          attempt: number
          delivery_id: number
          error: string | null
          finished_at: string | null
          id: number
          outcome: string | null
          provider: string | null
          started_at: string
        }
        ComputedFields: never
        Insert: {
          attempt: number
          delivery_id: number
          error?: string | null
          finished_at?: string | null
          id?: never
          outcome?: string | null
          provider?: string | null
          started_at?: string
        }
        Update: {
          attempt?: number
          delivery_id?: number
          error?: string | null
          finished_at?: string | null
          id?: never
          outcome?: string | null
          provider?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_attempts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_captures: {
        Row: {
          captured_at: string
          delivery_id: number
          headers: Json
          html_body: string
          subject: string
          text_body: string
        }
        ComputedFields: never
        Insert: {
          captured_at?: string
          delivery_id: number
          headers?: Json
          html_body: string
          subject: string
          text_body: string
        }
        Update: {
          captured_at?: string
          delivery_id?: number
          headers?: Json
          html_body?: string
          subject?: string
          text_body?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_captures_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_follows: {
        Row: {
          created_at: string
          organization_id: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_follows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preference_changes: {
        Row: {
          change: string
          created_at: string
          id: number
          organization_id: string | null
          source: string
          topic: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          change: string
          created_at?: string
          id?: never
          organization_id?: string | null
          source: string
          topic?: string | null
          user_id: string
        }
        Update: {
          change?: string
          created_at?: string
          id?: never
          organization_id?: string | null
          source?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preference_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preference_changes_topic_fkey"
            columns: ["topic"]
            isOneToOne: false
            referencedRelation: "notification_topics"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean
          in_app: boolean
          topic: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          email: boolean
          in_app: boolean
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          email?: boolean
          in_app?: boolean
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_topic_fkey"
            columns: ["topic"]
            isOneToOne: false
            referencedRelation: "notification_topics"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_provider_events: {
        Row: {
          dedupe_key: string
          delivery_id: number | null
          delivery_key: string | null
          event: string
          id: number
          occurred_at: string | null
          provider: string
          provider_message_id: string | null
          received_at: string
        }
        ComputedFields: never
        Insert: {
          dedupe_key: string
          delivery_id?: number | null
          delivery_key?: string | null
          event: string
          id?: never
          occurred_at?: string | null
          provider: string
          provider_message_id?: string | null
          received_at?: string
        }
        Update: {
          dedupe_key?: string
          delivery_id?: number | null
          delivery_key?: string | null
          event?: string
          id?: never
          occurred_at?: string | null
          provider?: string
          provider_message_id?: string | null
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_provider_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "notification_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          quiet_end: string
          quiet_hours: boolean
          quiet_start: string
          timezone: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          quiet_end?: string
          quiet_hours?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          quiet_end?: string
          quiet_hours?: boolean
          quiet_start?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_suppressions: {
        Row: {
          cleared_at: string | null
          cleared_by: string | null
          created_at: string
          email_hash: string
          id: number
          reason: string
          source: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          email_hash: string
          id?: never
          reason: string
          source: string
          user_id?: string | null
        }
        Update: {
          cleared_at?: string | null
          cleared_by?: string | null
          created_at?: string
          email_hash?: string
          id?: never
          reason?: string
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_topics: {
        Row: {
          category: string
          class: string
          default_email: boolean
          default_in_app: boolean
          description: string
          key: string
          label: string
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          category: string
          class: string
          default_email: boolean
          default_in_app: boolean
          description: string
          key: string
          label: string
          sort_order: number
        }
        Update: {
          category?: string
          class?: string
          default_email?: boolean
          default_in_app?: boolean
          description?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      notification_types: {
        Row: {
          confidential: boolean
          description: string
          email: boolean
          importance: string
          key: string
          topic: string
        }
        ComputedFields: never
        Insert: {
          confidential?: boolean
          description: string
          email: boolean
          importance: string
          key: string
          topic: string
        }
        Update: {
          confidential?: boolean
          description?: string
          email?: boolean
          importance?: string
          key?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_types_topic_fkey"
            columns: ["topic"]
            isOneToOne: false
            referencedRelation: "notification_topics"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_unsubscribe_tokens: {
        Row: {
          created_at: string
          expires_at: string
          token_hash: string
          topic: string
          used_at: string | null
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          expires_at: string
          token_hash: string
          topic: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          token_hash?: string
          topic?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_unsubscribe_tokens_topic_fkey"
            columns: ["topic"]
            isOneToOne: false
            referencedRelation: "notification_topics"
            referencedColumns: ["key"]
          },
        ]
      }
      notification_worker_runs: {
        Row: {
          accepted: number
          claimed: number
          error: string | null
          failed: number
          finished_at: string | null
          id: number
          mode: string
          skipped: number
          started_at: string
        }
        ComputedFields: never
        Insert: {
          accepted?: number
          claimed?: number
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: never
          mode: string
          skipped?: number
          started_at?: string
        }
        Update: {
          accepted?: number
          claimed?: number
          error?: string | null
          failed?: number
          finished_at?: string | null
          id?: never
          mode?: string
          skipped?: number
          started_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          application_id: string | null
          archived_at: string | null
          broadcast_id: string | null
          created_at: string
          dedupe_key: string
          event_id: string | null
          id: number
          importance: string | null
          kind: string
          organization_id: string | null
          payload: Json
          read_at: string | null
          recipient_id: string
          resource_id: string | null
          resource_type: string | null
        }
        ComputedFields: never
        Insert: {
          application_id?: string | null
          archived_at?: string | null
          broadcast_id?: string | null
          created_at?: string
          dedupe_key: string
          event_id?: string | null
          id?: never
          importance?: string | null
          kind: string
          organization_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id: string
          resource_id?: string | null
          resource_type?: string | null
        }
        Update: {
          application_id?: string | null
          archived_at?: string | null
          broadcast_id?: string | null
          created_at?: string
          dedupe_key?: string
          event_id?: string | null
          id?: never
          importance?: string | null
          kind?: string
          organization_id?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          resource_id?: string | null
          resource_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "notification_broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_kind_fkey"
            columns: ["kind"]
            isOneToOne: false
            referencedRelation: "notification_types"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_incident_updates: {
        Row: {
          author_id: string | null
          created_at: string
          id: number
          incident_id: string
          note: string
          status: string
        }
        ComputedFields: never
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: never
          incident_id: string
          note: string
          status: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: never
          incident_id?: string
          note?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_incident_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "operational_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_incidents: {
        Row: {
          created_at: string
          detected_at: string
          id: string
          impact: string | null
          kind: string
          opened_by: string | null
          owner_user_id: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          detected_at?: string
          id?: string
          impact?: string | null
          kind: string
          opened_by?: string | null
          owner_user_id?: string | null
          resolved_at?: string | null
          severity: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          id?: string
          impact?: string | null
          kind?: string
          opened_by?: string | null
          owner_user_id?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_editorial_settings: {
        Row: {
          organization_id: string
          review_mode: string
          show_authors: boolean
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          organization_id: string
          review_mode?: string
          show_authors?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          organization_id?: string
          review_mode?: string
          show_authors?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_editorial_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          mandate_ends_at: string | null
          membership_id: string | null
          organization_id: string
          position_id: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          mandate_ends_at?: string | null
          membership_id?: string | null
          organization_id: string
          position_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          mandate_ends_at?: string | null
          membership_id?: string | null
          organization_id?: string
          position_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_position_fkey"
            columns: ["position_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_slug_history: {
        Row: {
          organization_id: string
          replaced_at: string
          replaced_by: string | null
          slug: string
        }
        ComputedFields: never
        Insert: {
          organization_id: string
          replaced_at?: string
          replaced_by?: string | null
          slug: string
        }
        Update: {
          organization_id?: string
          replaced_at?: string
          replaced_by?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_slug_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          short_name: string | null
          slug: string
          status: string
          status_reason: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          accent?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          short_name?: string | null
          slug: string
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          accent?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          short_name?: string | null
          slug?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          category: string
          description: string
          is_delegable: boolean
          is_grantable: boolean
          is_sensitive: boolean
          key: string
          label: string
          module_ready: boolean
          scope: string
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          category: string
          description: string
          is_delegable?: boolean
          is_grantable?: boolean
          is_sensitive?: boolean
          key: string
          label: string
          module_ready?: boolean
          scope: string
          sort_order: number
        }
        Update: {
          category?: string
          description?: string
          is_delegable?: boolean
          is_grantable?: boolean
          is_sensitive?: boolean
          key?: string
          label?: string
          module_ready?: boolean
          scope?: string
          sort_order?: number
        }
        Relationships: []
      }
      platform_assignments: {
        Row: {
          created_at: string
          end_reason: string | null
          ended_by: string | null
          ends_at: string
          id: string
          reason: string
          role: string
          source: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          end_reason?: string | null
          ended_by?: string | null
          ends_at: string
          id?: string
          reason: string
          role: string
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_reason?: string | null
          ended_by?: string | null
          ends_at?: string
          id?: string
          reason?: string
          role?: string
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_role_permissions: {
        Row: {
          permission_key: string
          role: string
        }
        ComputedFields: never
        Insert: {
          permission_key: string
          role: string
        }
        Update: {
          permission_key?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      position_assignments: {
        Row: {
          appointed_by: string | null
          created_at: string
          end_reason: string | null
          ended_by: string | null
          ends_at: string
          id: string
          membership_id: string
          office: string | null
          organization_id: string
          position_id: string
          source: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          appointed_by?: string | null
          created_at?: string
          end_reason?: string | null
          ended_by?: string | null
          ends_at: string
          id?: string
          membership_id: string
          office?: string | null
          organization_id: string
          position_id: string
          source: string
          starts_at: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointed_by?: string | null
          created_at?: string
          end_reason?: string | null
          ended_by?: string | null
          ends_at?: string
          id?: string
          membership_id?: string
          office?: string | null
          organization_id?: string
          position_id?: string
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_assignments_membership_fkey"
            columns: ["membership_id", "organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id", "organization_id", "user_id"]
          },
          {
            foreignKeyName: "position_assignments_position_fkey"
            columns: ["position_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      position_permissions: {
        Row: {
          permission_key: string
          position_id: string
        }
        ComputedFields: never
        Insert: {
          permission_key: string
          position_id: string
        }
        Update: {
          permission_key?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "position_permissions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      position_template_permissions: {
        Row: {
          permission_key: string
          template_key: string
        }
        ComputedFields: never
        Insert: {
          permission_key: string
          template_key: string
        }
        Update: {
          permission_key?: string
          template_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_template_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "position_template_permissions_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "position_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      position_templates: {
        Row: {
          description: string
          key: string
          label: string
          office: string | null
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          description: string
          key: string
          label: string
          office?: string | null
          sort_order: number
        }
        Update: {
          description?: string
          key?: string
          label?: string
          office?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          office: string | null
          organization_id: string
          sort_order: number
          template_key: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          office?: string | null
          organization_id: string
          sort_order?: number
          template_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          office?: string | null
          organization_id?: string
          sort_order?: number
          template_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "position_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      post_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      post_reviews: {
        Row: {
          content_hash: string
          created_at: string
          decision: string
          id: string
          note: string | null
          post_id: string
          reviewer_id: string
          revision_id: string
        }
        ComputedFields: never
        Insert: {
          content_hash: string
          created_at?: string
          decision: string
          id?: string
          note?: string | null
          post_id: string
          reviewer_id: string
          revision_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          decision?: string
          id?: string
          note?: string | null
          post_id?: string
          reviewer_id?: string
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reviews_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reviews_revision_fkey"
            columns: ["revision_id", "post_id"]
            isOneToOne: false
            referencedRelation: "post_revisions"
            referencedColumns: ["id", "post_id"]
          },
        ]
      }
      post_revision_media: {
        Row: {
          media_id: string
          revision_id: string
          role: string
        }
        ComputedFields: never
        Insert: {
          media_id: string
          revision_id: string
          role: string
        }
        Update: {
          media_id?: string
          revision_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_revision_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revision_media_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "post_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      post_revisions: {
        Row: {
          body: Json
          category_id: string | null
          contributors: string[]
          cover_media_id: string | null
          created_at: string
          created_by: string
          id: string
          intro: string | null
          kind: string
          number: number
          post_id: string
          published_at: string | null
          restored_from: string | null
          review_mode: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          search: unknown
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by: string
          version: number
        }
        ComputedFields: never
        Insert: {
          body?: Json
          category_id?: string | null
          contributors: string[]
          cover_media_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          intro?: string | null
          kind: string
          number: number
          post_id: string
          published_at?: string | null
          restored_from?: string | null
          review_mode?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search?: never
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          body?: Json
          category_id?: string | null
          contributors?: string[]
          cover_media_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          intro?: string | null
          kind?: string
          number?: number
          post_id?: string
          published_at?: string | null
          restored_from?: string | null
          review_mode?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          search?: never
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_revisions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "post_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_revisions_restored_from_fkey"
            columns: ["restored_from"]
            isOneToOne: false
            referencedRelation: "post_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      post_slug_history: {
        Row: {
          post_id: string
          replaced_at: string
          replaced_by: string | null
          slug: string
        }
        ComputedFields: never
        Insert: {
          post_id: string
          replaced_at?: string
          replaced_by?: string | null
          slug: string
        }
        Update: {
          post_id?: string
          replaced_at?: string
          replaced_by?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_slug_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          event_id: string | null
          first_published_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          organization_id: string
          pinned_at: string | null
          pinned_by: string | null
          prominence: string
          prominence_by: string | null
          prominence_until: string | null
          publication: string
          published_at: string | null
          published_by: string | null
          published_revision_id: string | null
          recruitment_campaign_id: string | null
          schedule_attempted_at: string | null
          schedule_attempts: number
          schedule_error: string | null
          schedule_status: string | null
          scheduled_at: string | null
          scheduled_by: string | null
          scheduled_revision_id: string | null
          slug: string | null
          unpublished_at: string | null
          updated_at: string
          working_revision_id: string
        }
        ComputedFields: never
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          event_id?: string | null
          first_published_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          organization_id: string
          pinned_at?: string | null
          pinned_by?: string | null
          prominence?: string
          prominence_by?: string | null
          prominence_until?: string | null
          publication?: string
          published_at?: string | null
          published_by?: string | null
          published_revision_id?: string | null
          recruitment_campaign_id?: string | null
          schedule_attempted_at?: string | null
          schedule_attempts?: number
          schedule_error?: string | null
          schedule_status?: string | null
          scheduled_at?: string | null
          scheduled_by?: string | null
          scheduled_revision_id?: string | null
          slug?: string | null
          unpublished_at?: string | null
          updated_at?: string
          working_revision_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          event_id?: string | null
          first_published_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          organization_id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          prominence?: string
          prominence_by?: string | null
          prominence_until?: string | null
          publication?: string
          published_at?: string | null
          published_by?: string | null
          published_revision_id?: string | null
          recruitment_campaign_id?: string | null
          schedule_attempted_at?: string | null
          schedule_attempts?: number
          schedule_error?: string | null
          schedule_status?: string | null
          scheduled_at?: string | null
          scheduled_by?: string | null
          scheduled_revision_id?: string | null
          slug?: string | null
          unpublished_at?: string | null
          updated_at?: string
          working_revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_published_revision_fkey"
            columns: ["published_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "post_revisions"
            referencedColumns: ["id", "post_id"]
          },
          {
            foreignKeyName: "posts_recruitment_campaign_id_fkey"
            columns: ["recruitment_campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_scheduled_revision_fkey"
            columns: ["scheduled_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "post_revisions"
            referencedColumns: ["id", "post_id"]
          },
          {
            foreignKeyName: "posts_working_revision_fkey"
            columns: ["working_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "post_revisions"
            referencedColumns: ["id", "post_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          onboarding_completed_at: string | null
          program: string | null
          study_year: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          program?: string | null
          study_year?: number | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarding_completed_at?: string | null
          program?: string | null
          study_year?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      recruitment_campaign_slug_history: {
        Row: {
          campaign_id: string
          replaced_at: string
          slug: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          replaced_at?: string
          slug: string
        }
        Update: {
          campaign_id?: string
          replaced_at?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_campaign_slug_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_campaigns: {
        Row: {
          academic_year: string | null
          active_form_version_id: string | null
          approval_policy: string
          archived_at: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          closed_at: string | null
          closes_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_role: string | null
          cover_media_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duplicated_from: string | null
          eligibility_note: string | null
          eligible_years: number[] | null
          faq: Json
          first_published_at: string | null
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          max_applications: number
          opens_at: string | null
          organization_id: string
          paused_at: string | null
          process: Json
          publication: string
          published_at: string | null
          required_reviews: number
          search: unknown
          slug: string | null
          status: string
          summary: string | null
          timezone: string
          title: string
          unpublished_at: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        ComputedFields: never
        Insert: {
          academic_year?: string | null
          active_form_version_id?: string | null
          approval_policy?: string
          archived_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closes_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_role?: string | null
          cover_media_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duplicated_from?: string | null
          eligibility_note?: string | null
          eligible_years?: number[] | null
          faq?: Json
          first_published_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          max_applications?: number
          opens_at?: string | null
          organization_id: string
          paused_at?: string | null
          process?: Json
          publication?: string
          published_at?: string | null
          required_reviews?: number
          search?: never
          slug?: string | null
          status?: string
          summary?: string | null
          timezone?: string
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          academic_year?: string | null
          active_form_version_id?: string | null
          approval_policy?: string
          archived_at?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          closed_at?: string | null
          closes_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_role?: string | null
          cover_media_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duplicated_from?: string | null
          eligibility_note?: string | null
          eligible_years?: number[] | null
          faq?: Json
          first_published_at?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          max_applications?: number
          opens_at?: string | null
          organization_id?: string
          paused_at?: string | null
          process?: Json
          publication?: string
          published_at?: string | null
          required_reviews?: number
          search?: never
          slug?: string | null
          status?: string
          summary?: string | null
          timezone?: string
          title?: string
          unpublished_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_campaigns_active_form_version_id_fkey"
            columns: ["active_form_version_id"]
            isOneToOne: false
            referencedRelation: "recruitment_form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_campaigns_cover_media_id_fkey"
            columns: ["cover_media_id"]
            isOneToOne: false
            referencedRelation: "association_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_campaigns_duplicated_from_fkey"
            columns: ["duplicated_from"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_clarifications: {
        Row: {
          allows_documents: boolean
          answer: string | null
          answered_at: string | null
          application_id: string
          asked_at: string
          asked_by: string | null
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          due_at: string | null
          extensions: Json
          id: string
          original_due_at: string | null
          question: string
          status: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          allows_documents?: boolean
          answer?: string | null
          answered_at?: string | null
          application_id: string
          asked_at?: string
          asked_by?: string | null
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          due_at?: string | null
          extensions?: Json
          id?: string
          original_due_at?: string | null
          question: string
          status?: string
          updated_at?: string
        }
        Update: {
          allows_documents?: boolean
          answer?: string | null
          answered_at?: string | null
          application_id?: string
          asked_at?: string
          asked_by?: string | null
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          due_at?: string | null
          extensions?: Json
          id?: string
          original_due_at?: string | null
          question?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_clarifications_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_committee_members: {
        Row: {
          appointed_by: string | null
          campaign_id: string
          created_at: string
          ends_at: string
          id: string
          membership_id: string
          organization_id: string
          powers: string[]
          purpose: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          scope: string
          starts_at: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          appointed_by?: string | null
          campaign_id: string
          created_at?: string
          ends_at: string
          id?: string
          membership_id: string
          organization_id: string
          powers: string[]
          purpose?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          scope: string
          starts_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointed_by?: string | null
          campaign_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          membership_id?: string
          organization_id?: string
          powers?: string[]
          purpose?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          scope?: string
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_committee_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_committee_members_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_committee_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_committee_positions: {
        Row: {
          campaign_id: string
          member_id: string
          position_id: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          member_id: string
          position_id: string
        }
        Update: {
          campaign_id?: string
          member_id?: string
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_committee_positions_member_fkey"
            columns: ["member_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_committee_members"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_committee_positions_position_fkey"
            columns: ["position_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_positions"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_conflicts: {
        Row: {
          application_id: string
          campaign_id: string
          declared_at: string
          id: string
          note: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          application_id: string
          campaign_id: string
          declared_at?: string
          id?: string
          note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          application_id?: string
          campaign_id?: string
          declared_at?: string
          id?: string
          note?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_conflicts_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_decision_approvals: {
        Row: {
          approved_at: string
          approver_id: string
          as_president: boolean
          decision_id: string
        }
        ComputedFields: never
        Insert: {
          approved_at?: string
          approver_id: string
          as_president?: boolean
          decision_id: string
        }
        Update: {
          approved_at?: string
          approver_id?: string
          as_president?: boolean
          decision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_decision_approvals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "recruitment_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_decisions: {
        Row: {
          application_id: string
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          capacity_override_reason: string | null
          created_at: string
          finalized_at: string | null
          id: string
          message: string | null
          offer_expires_at: string | null
          outcome: string
          position_id: string
          proposed_at: string
          proposed_by: string | null
          rationale: string | null
          release_scheduled_at: string | null
          release_scheduled_by: string | null
          released_at: string | null
          released_by: string | null
          return_reason: string | null
          returned_at: string | null
          returned_by: string | null
          reviews_override_reason: string | null
          status: string
          superseded_at: string | null
          updated_at: string
          version: number
          waitlist_rank: number | null
        }
        ComputedFields: never
        Insert: {
          application_id: string
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity_override_reason?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          message?: string | null
          offer_expires_at?: string | null
          outcome: string
          position_id: string
          proposed_at?: string
          proposed_by?: string | null
          rationale?: string | null
          release_scheduled_at?: string | null
          release_scheduled_by?: string | null
          released_at?: string | null
          released_by?: string | null
          return_reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          reviews_override_reason?: string | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
          waitlist_rank?: number | null
        }
        Update: {
          application_id?: string
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          capacity_override_reason?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          message?: string | null
          offer_expires_at?: string | null
          outcome?: string
          position_id?: string
          proposed_at?: string
          proposed_by?: string | null
          rationale?: string | null
          release_scheduled_at?: string | null
          release_scheduled_by?: string | null
          released_at?: string | null
          released_by?: string | null
          return_reason?: string | null
          returned_at?: string | null
          returned_by?: string | null
          reviews_override_reason?: string | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          version?: number
          waitlist_rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_decisions_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_decisions_position_fkey"
            columns: ["position_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_positions"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_form_versions: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          edit_version: number
          id: string
          number: number
          published_at: string | null
          published_by: string | null
          schema: Json
          status: string
          superseded_at: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          edit_version?: number
          id?: string
          number: number
          published_at?: string | null
          published_by?: string | null
          schema?: Json
          status?: string
          superseded_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          edit_version?: number
          id?: string
          number?: number
          published_at?: string | null
          published_by?: string | null
          schema?: Json
          status?: string
          superseded_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_form_versions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_interview_slots: {
        Row: {
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          instructions: string | null
          location: string | null
          meeting_link: string | null
          mode: string
          position_id: string | null
          starts_at: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          instructions?: string | null
          location?: string | null
          meeting_link?: string | null
          mode: string
          position_id?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          instructions?: string | null
          location?: string | null
          meeting_link?: string | null
          mode?: string
          position_id?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_interview_slots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_interview_slots_position_fkey"
            columns: ["position_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_positions"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_interviews: {
        Row: {
          application_id: string
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          message: string | null
          respond_by: string | null
          scheduled_at: string | null
          slot_id: string | null
          status: string
          updated_at: string
          version: number
        }
        ComputedFields: never
        Insert: {
          application_id: string
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          message?: string | null
          respond_by?: string | null
          scheduled_at?: string | null
          slot_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          application_id?: string
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          message?: string | null
          respond_by?: string | null
          scheduled_at?: string | null
          slot_id?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_interviews_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_interviews_slot_fkey"
            columns: ["slot_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_interview_slots"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_message_templates: {
        Row: {
          body: string
          campaign_id: string
          kind: string
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          body: string
          campaign_id: string
          kind: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          campaign_id?: string
          kind?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_message_templates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_offers: {
        Row: {
          application_id: string
          campaign_id: string
          candidate_id: string
          created_at: string
          decision_id: string
          expires_at: string | null
          id: string
          onboarding_at: string | null
          onboarding_by: string | null
          onboarding_invitation_id: string | null
          responded_at: string | null
          response_note: string | null
          status: string
          updated_at: string
          withdraw_reason: string | null
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        ComputedFields: never
        Insert: {
          application_id: string
          campaign_id: string
          candidate_id: string
          created_at?: string
          decision_id: string
          expires_at?: string | null
          id?: string
          onboarding_at?: string | null
          onboarding_by?: string | null
          onboarding_invitation_id?: string | null
          responded_at?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          withdraw_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          application_id?: string
          campaign_id?: string
          candidate_id?: string
          created_at?: string
          decision_id?: string
          expires_at?: string | null
          id?: string
          onboarding_at?: string | null
          onboarding_by?: string | null
          onboarding_invitation_id?: string | null
          responded_at?: string | null
          response_note?: string | null
          status?: string
          updated_at?: string
          withdraw_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_offers_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_offers_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: true
            referencedRelation: "recruitment_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_offers_onboarding_invitation_id_fkey"
            columns: ["onboarding_invitation_id"]
            isOneToOne: false
            referencedRelation: "organization_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_positions: {
        Row: {
          campaign_id: string
          closes_at: string | null
          commitment: string | null
          created_at: string
          description: string | null
          display_order: number
          eligible_years: number[] | null
          expectations: string | null
          id: string
          missions: string | null
          openings: number | null
          retired_at: string | null
          slug: string
          summary: string | null
          team: string | null
          template_key: string | null
          title: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          closes_at?: string | null
          commitment?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          eligible_years?: number[] | null
          expectations?: string | null
          id?: string
          missions?: string | null
          openings?: number | null
          retired_at?: string | null
          slug: string
          summary?: string | null
          team?: string | null
          template_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          closes_at?: string | null
          commitment?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          eligible_years?: number[] | null
          expectations?: string | null
          id?: string
          missions?: string | null
          openings?: number | null
          retired_at?: string | null
          slug?: string
          summary?: string | null
          team?: string | null
          template_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_positions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruitment_positions_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "position_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      recruitment_review_assignments: {
        Row: {
          application_id: string
          assigned_at: string
          assigned_by: string | null
          campaign_id: string
          id: string
          member_id: string
          removed_at: string | null
          removed_by: string | null
        }
        ComputedFields: never
        Insert: {
          application_id: string
          assigned_at?: string
          assigned_by?: string | null
          campaign_id: string
          id?: string
          member_id: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          application_id?: string
          assigned_at?: string
          assigned_by?: string | null
          campaign_id?: string
          id?: string
          member_id?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_review_assignments_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_review_assignments_member_fkey"
            columns: ["member_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_committee_members"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_review_revisions: {
        Row: {
          id: number
          note: string | null
          number: number
          reason: string | null
          recommendation: string | null
          review_id: string
          rubric_version_id: string | null
          scores: Json
          submitted_at: string
        }
        ComputedFields: never
        Insert: {
          id?: never
          note?: string | null
          number: number
          reason?: string | null
          recommendation?: string | null
          review_id: string
          rubric_version_id?: string | null
          scores: Json
          submitted_at?: string
        }
        Update: {
          id?: never
          note?: string | null
          number?: number
          reason?: string | null
          recommendation?: string | null
          review_id?: string
          rubric_version_id?: string | null
          scores?: Json
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_review_revisions_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "recruitment_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_reviews: {
        Row: {
          amended_at: string | null
          application_id: string
          campaign_id: string
          created_at: string
          id: string
          interview_id: string | null
          kind: string
          note: string | null
          recommendation: string | null
          reviewer_id: string
          revision_count: number
          rubric_version_id: string | null
          scores: Json
          status: string
          submitted_at: string | null
          updated_at: string
          version: number
        }
        ComputedFields: never
        Insert: {
          amended_at?: string | null
          application_id: string
          campaign_id: string
          created_at?: string
          id?: string
          interview_id?: string | null
          kind: string
          note?: string | null
          recommendation?: string | null
          reviewer_id: string
          revision_count?: number
          rubric_version_id?: string | null
          scores?: Json
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          amended_at?: string | null
          application_id?: string
          campaign_id?: string
          created_at?: string
          id?: string
          interview_id?: string | null
          kind?: string
          note?: string | null
          recommendation?: string | null
          reviewer_id?: string
          revision_count?: number
          rubric_version_id?: string | null
          scores?: Json
          status?: string
          submitted_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_reviews_application_fkey"
            columns: ["application_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_reviews_interview_fkey"
            columns: ["interview_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_interviews"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_reviews_rubric_fkey"
            columns: ["rubric_version_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_rubric_versions"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_rubric_versions: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          criteria: Json
          edit_version: number
          id: string
          kind: string
          number: number
          published_at: string | null
          published_by: string | null
          status: string
          superseded_at: string | null
          updated_at: string
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          criteria?: Json
          edit_version?: number
          id?: string
          kind: string
          number: number
          published_at?: string | null
          published_by?: string | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          criteria?: Json
          edit_version?: number
          id?: string
          kind?: string
          number?: number
          published_at?: string | null
          published_by?: string | null
          status?: string
          superseded_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_rubric_versions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_settings: {
        Row: {
          draft_retention_months: number | null
          id: boolean
          privacy_contact: string | null
          privacy_notice: string | null
          selected_retention_months: number | null
          submitted_retention_months: number | null
          updated_at: string
          updated_by: string | null
          withdrawn_retention_months: number | null
        }
        ComputedFields: never
        Insert: {
          draft_retention_months?: number | null
          id?: boolean
          privacy_contact?: string | null
          privacy_notice?: string | null
          selected_retention_months?: number | null
          submitted_retention_months?: number | null
          updated_at?: string
          updated_by?: string | null
          withdrawn_retention_months?: number | null
        }
        Update: {
          draft_retention_months?: number | null
          id?: boolean
          privacy_contact?: string | null
          privacy_notice?: string | null
          selected_retention_months?: number | null
          submitted_retention_months?: number | null
          updated_at?: string
          updated_by?: string | null
          withdrawn_retention_months?: number | null
        }
        Relationships: []
      }
      recruitment_slot_interviewers: {
        Row: {
          campaign_id: string
          member_id: string
          slot_id: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          member_id: string
          slot_id: string
        }
        Update: {
          campaign_id?: string
          member_id?: string
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_slot_interviewers_member_fkey"
            columns: ["member_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_committee_members"
            referencedColumns: ["id", "campaign_id"]
          },
          {
            foreignKeyName: "recruitment_slot_interviewers_slot_fkey"
            columns: ["slot_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_interview_slots"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      recruitment_tags: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string
        }
        ComputedFields: never
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_tags_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recruitment_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_policies: {
        Row: {
          keep_months: number | null
          note: string | null
          policy_key: string
          sort_order: number
          updated_at: string | null
          updated_by: string | null
        }
        ComputedFields: never
        Insert: {
          keep_months?: number | null
          note?: string | null
          policy_key: string
          sort_order: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          keep_months?: number | null
          note?: string | null
          policy_key?: string
          sort_order?: number
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      scheduled_job_runs: {
        Row: {
          duration_ms: number
          error: string | null
          finished_at: string
          id: number
          job_key: string
          requested_by: string | null
          result: Json | null
          started_at: string
          status: string
          trigger: string
        }
        ComputedFields: never
        Insert: {
          duration_ms?: number
          error?: string | null
          finished_at: string
          id?: never
          job_key: string
          requested_by?: string | null
          result?: Json | null
          started_at: string
          status: string
          trigger: string
        }
        Update: {
          duration_ms?: number
          error?: string | null
          finished_at?: string
          id?: never
          job_key?: string
          requested_by?: string | null
          result?: Json | null
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_job_runs_job_key_fkey"
            columns: ["job_key"]
            isOneToOne: false
            referencedRelation: "scheduled_jobs"
            referencedColumns: ["job_key"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          area: string
          consecutive_failures: number
          created_at: string
          critical: boolean
          expected_every: string
          job_key: string
          last_duration_ms: number | null
          last_error: string | null
          last_failed_at: string | null
          last_finished_at: string | null
          last_result: Json | null
          last_started_at: string | null
          last_status: string | null
          last_succeeded_at: string | null
          retryable: boolean
          schedule: string
          sort_order: number
        }
        ComputedFields: never
        Insert: {
          area: string
          consecutive_failures?: number
          created_at?: string
          critical?: boolean
          expected_every: string
          job_key: string
          last_duration_ms?: number | null
          last_error?: string | null
          last_failed_at?: string | null
          last_finished_at?: string | null
          last_result?: Json | null
          last_started_at?: string | null
          last_status?: string | null
          last_succeeded_at?: string | null
          retryable?: boolean
          schedule: string
          sort_order?: number
        }
        Update: {
          area?: string
          consecutive_failures?: number
          created_at?: string
          critical?: boolean
          expected_every?: string
          job_key?: string
          last_duration_ms?: number | null
          last_error?: string | null
          last_failed_at?: string | null
          last_finished_at?: string | null
          last_result?: Json | null
          last_started_at?: string | null
          last_status?: string | null
          last_succeeded_at?: string | null
          retryable?: boolean
          schedule?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      academic_year_preparation: { Args: { p_year_id?: string }; Returns: Json }
      academic_years: { Args: never; Returns: Json }
      account_responsibilities: { Args: { p_email: string }; Returns: Json }
      add_recruitment_position: {
        Args: { p_campaign_id: string; p_title: string }
        Returns: string
      }
      am_i_following: { Args: { p_organization_id: string }; Returns: boolean }
      amend_recruitment_review: {
        Args: {
          p_note: string
          p_reason: string
          p_recommendation: string
          p_review_id: string
          p_scores: Json
        }
        Returns: Json
      }
      answer_clarification: {
        Args: { p_answer: string; p_clarification_id: string }
        Returns: Json
      }
      appoint_recruitment_member: {
        Args: {
          p_campaign_id: string
          p_ends_at?: string
          p_membership_id: string
          p_position_ids?: string[]
          p_powers: string[]
          p_purpose?: string
          p_role: string
          p_scope: string
        }
        Returns: string
      }
      approve_bde_succession: {
        Args: { p_transition_id: string }
        Returns: string
      }
      approve_notification_broadcast: { Args: { p_id: string }; Returns: Json }
      approve_recruitment_decision: {
        Args: {
          p_capacity_override_reason?: string
          p_decision_id: string
          p_reviews_override_reason?: string
        }
        Returns: Json
      }
      archive_notifications: {
        Args: { p_archive?: boolean; p_ids: number[] }
        Returns: number
      }
      archive_position: {
        Args: { p_position_id: string; p_reason: string }
        Returns: undefined
      }
      archive_post: {
        Args: { p_archive?: boolean; p_post_id: string }
        Returns: undefined
      }
      archive_recruitment_campaign: {
        Args: { p_archived: boolean; p_campaign_id: string }
        Returns: undefined
      }
      assign_position: {
        Args: {
          p_ends_at: string
          p_membership_id: string
          p_position_id: string
          p_starts_at?: string
        }
        Returns: string
      }
      assign_recruitment_reviews: {
        Args: {
          p_application_ids: string[]
          p_campaign_id: string
          p_member_ids: string[]
          p_mode?: string
        }
        Returns: Json
      }
      association_editor: { Args: { p_organization_id: string }; Returns: Json }
      association_preview: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      book_interview_slot: {
        Args: { p_interview_id: string; p_slot_id: string }
        Returns: Json
      }
      cancel_clarification: {
        Args: { p_clarification_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: number
      }
      cancel_interview: {
        Args: { p_interview_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_interview_slot: {
        Args: { p_reason?: string; p_slot_id: string }
        Returns: undefined
      }
      cancel_leadership_transition: {
        Args: { p_reason?: string; p_transition_id: string }
        Returns: undefined
      }
      cancel_my_registration: { Args: { p_event_id: string }; Returns: Json }
      cancel_notification_broadcast: {
        Args: { p_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_post_schedule: { Args: { p_post_id: string }; Returns: undefined }
      cancel_recruitment_campaign: {
        Args: { p_campaign_id: string; p_reason: string }
        Returns: number
      }
      cancel_recruitment_decision: {
        Args: { p_decision_id: string; p_reason: string }
        Returns: undefined
      }
      cancel_scheduled_release: {
        Args: { p_decision_id: string }
        Returns: undefined
      }
      change_event_slug: {
        Args: { p_event_id: string; p_slug: string }
        Returns: string
      }
      change_organization_slug: {
        Args: { p_organization_id: string; p_slug: string }
        Returns: string
      }
      change_post_slug: {
        Args: { p_post_id: string; p_slug: string }
        Returns: string
      }
      change_recruitment_slug: {
        Args: { p_campaign_id: string; p_slug: string }
        Returns: string
      }
      claim_storage_cleanup: { Args: { p_limit?: number }; Returns: Json }
      clear_my_email_suppression: { Args: never; Returns: number }
      complete_interview: {
        Args: { p_interview_id: string; p_outcome: string }
        Returns: undefined
      }
      complete_storage_cleanup: {
        Args: { p_error?: string; p_id: number; p_ok: boolean }
        Returns: undefined
      }
      confirm_academic_year_check: {
        Args: {
          p_check: string
          p_done: boolean
          p_note?: string
          p_year_id: string
        }
        Returns: undefined
      }
      confirm_academic_year_rollover: {
        Args: { p_acknowledge_warnings?: boolean; p_year_id: string }
        Returns: Json
      }
      confirm_application_document: {
        Args: { p_document_id: string; p_replaces?: string }
        Returns: Json
      }
      confirm_clarification_document: {
        Args: { p_document_id: string }
        Returns: Json
      }
      content_dashboard: { Args: { p_organization_id: string }; Returns: Json }
      continuity_handover_report: { Args: never; Returns: Json }
      create_association_category: {
        Args: { p_label: string; p_slug: string; p_sort_order?: number }
        Returns: string
      }
      create_delegation: {
        Args: {
          p_delegate_membership_id: string
          p_ends_at: string
          p_organization_id: string
          p_permissions: string[]
          p_reason: string
          p_starts_at?: string
        }
        Returns: string
      }
      create_event: {
        Args: { p_organization_id: string; p_title?: string }
        Returns: string
      }
      create_event_category: {
        Args: { p_label: string; p_slug: string; p_sort_order?: number }
        Returns: string
      }
      create_interview_slots: {
        Args: {
          p_campaign_id: string
          p_instructions?: string
          p_location?: string
          p_meeting_link?: string
          p_member_ids?: string[]
          p_minutes: number
          p_mode: string
          p_position_id: string
          p_starts: string[]
        }
        Returns: Json
      }
      create_notification_broadcast: {
        Args: {
          p_audience: string
          p_body: string
          p_email?: boolean
          p_importance?: string
          p_link_path?: string
          p_organization_id: string
          p_title: string
        }
        Returns: Json
      }
      create_organization: {
        Args: {
          p_accent?: string
          p_category?: string
          p_name: string
          p_short_name?: string
          p_slug: string
          p_tagline?: string
        }
        Returns: string
      }
      create_position: {
        Args: {
          p_description?: string
          p_organization_id: string
          p_permissions: string[]
          p_template_key?: string
          p_title: string
        }
        Returns: string
      }
      create_post: {
        Args: { p_kind: string; p_organization_id: string; p_title?: string }
        Returns: string
      }
      create_post_category: {
        Args: { p_label: string; p_slug: string; p_sort_order?: number }
        Returns: string
      }
      create_recruitment_campaign: {
        Args: { p_organization_id: string; p_title: string }
        Returns: string
      }
      create_recruitment_tag: {
        Args: { p_campaign_id: string; p_label: string }
        Returns: string
      }
      current_academic_year: { Args: never; Returns: Json }
      declare_recruitment_conflict: {
        Args: { p_application_id: string; p_note?: string }
        Returns: string
      }
      delete_application_draft: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      delete_event_draft: { Args: { p_event_id: string }; Returns: undefined }
      delete_post_draft: { Args: { p_post_id: string }; Returns: undefined }
      delete_recruitment_draft: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      delete_recruitment_review_draft: {
        Args: { p_review_id: string }
        Returns: undefined
      }
      delete_recruitment_tag: { Args: { p_tag_id: string }; Returns: undefined }
      discard_recruitment_form_draft: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      discard_recruitment_rubric_draft: {
        Args: { p_campaign_id: string; p_kind: string }
        Returns: undefined
      }
      dismiss_report: {
        Args: { p_note?: string; p_report_id: string }
        Returns: undefined
      }
      duplicate_recruitment_campaign: {
        Args: { p_campaign_id: string; p_title: string }
        Returns: string
      }
      end_assignment: {
        Args: { p_assignment_id: string; p_reason?: string }
        Returns: undefined
      }
      end_office_mandate: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: undefined
      }
      event_attendees: {
        Args: {
          p_event_id: string
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_status?: string
        }
        Returns: Json
      }
      event_dashboard: { Args: { p_organization_id: string }; Returns: Json }
      event_editor: { Args: { p_event_id: string }; Returns: Json }
      event_preview: { Args: { p_event_id: string }; Returns: Json }
      export_event_attendees: { Args: { p_event_id: string }; Returns: Json }
      extend_clarification: {
        Args: {
          p_clarification_id: string
          p_due_at: string
          p_reason?: string
        }
        Returns: undefined
      }
      follow_organization: {
        Args: {
          p_follow: boolean
          p_organization_id: string
          p_source?: string
        }
        Returns: boolean
      }
      governance_health: { Args: never; Returns: Json }
      governance_history: {
        Args: { p_limit?: number; p_organization_id?: string }
        Returns: Json
      }
      governance_overview: { Args: never; Returns: Json }
      guardian_continuity: { Args: never; Returns: Json }
      hide_event: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      hide_post: {
        Args: { p_post_id: string; p_reason: string }
        Returns: undefined
      }
      hide_recruitment_campaign: {
        Args: { p_campaign_id: string; p_reason: string }
        Returns: undefined
      }
      invite_member: {
        Args: {
          p_email: string
          p_mandate_ends_at?: string
          p_organization_id: string
          p_position_id?: string
        }
        Returns: string
      }
      invite_to_interview: {
        Args: {
          p_application_ids: string[]
          p_message?: string
          p_respond_by?: string
        }
        Returns: Json
      }
      mark_notifications_read: { Args: { p_ids?: number[] }; Returns: number }
      member_access: { Args: { p_membership_id: string }; Returns: Json }
      moderated_post: { Args: { p_post_id: string }; Returns: Json }
      moderation_queue: { Args: never; Returns: Json }
      move_recruitment_applications: {
        Args: { p_application_ids: string[]; p_stage: string }
        Returns: Json
      }
      move_recruitment_position: {
        Args: { p_direction: number; p_position_id: string }
        Returns: undefined
      }
      my_access: { Args: never; Returns: Json }
      my_application: { Args: { p_application_id: string }; Returns: Json }
      my_application_document: {
        Args: { p_document_id: string }
        Returns: Json
      }
      my_applications: { Args: never; Returns: Json }
      my_event_status: { Args: { p_event_id: string }; Returns: Json }
      my_events: { Args: never; Returns: Json }
      my_governance_inbox: { Args: never; Returns: Json }
      my_notification_preferences: { Args: never; Returns: Json }
      my_notification_summary: { Args: never; Returns: Json }
      my_notifications: {
        Args: {
          p_before?: string
          p_before_id?: number
          p_category?: string
          p_limit?: number
          p_view?: string
        }
        Returns: Json
      }
      my_recruitment_work: { Args: never; Returns: Json }
      notification_broadcast_options: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      notification_failed_deliveries: {
        Args: { p_before_id?: number; p_limit?: number }
        Returns: Json
      }
      notification_health: { Args: never; Returns: Json }
      open_notification: { Args: { p_id: number }; Returns: Json }
      open_operational_incident: {
        Args: {
          p_detected_at?: string
          p_impact?: string
          p_kind: string
          p_severity: string
          p_title: string
        }
        Returns: string
      }
      order_recruitment_waitlist: {
        Args: { p_campaign_id: string; p_decision_ids: string[] }
        Returns: undefined
      }
      organization_broadcasts: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      organization_continuity: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      organization_governance: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      organization_team: { Args: { p_organization_id: string }; Returns: Json }
      peek_unsubscribe_token: { Args: { p_token: string }; Returns: Json }
      platform_events: {
        Args: { p_q?: string; p_view?: string }
        Returns: Json
      }
      platform_heartbeat: { Args: never; Returns: Json }
      platform_operations: { Args: never; Returns: Json }
      platform_organizations: { Args: never; Returns: Json }
      platform_recruitment: {
        Args: { p_q?: string; p_view?: string }
        Returns: Json
      }
      post_application_comment: {
        Args: {
          p_application_id: string
          p_body: string
          p_mentions?: string[]
        }
        Returns: string
      }
      post_campaign_options: { Args: { p_post_id: string }; Returns: Json }
      post_editor: { Args: { p_post_id: string }; Returns: Json }
      post_event_options: { Args: { p_post_id: string }; Returns: Json }
      post_preview: {
        Args: { p_post_id: string; p_revision_id?: string }
        Returns: Json
      }
      preview_retention_policy: {
        Args: { p_key: string; p_months: number }
        Returns: Json
      }
      privacy_candidate_report: {
        Args: { p_email: string; p_reason: string }
        Returns: Json
      }
      privacy_erase_application: {
        Args: { p_application_id: string; p_reason: string }
        Returns: undefined
      }
      propose_association_appointment: {
        Args: {
          p_candidate_email: string
          p_mandate_ends_at: string
          p_organization_id: string
          p_reason: string
        }
        Returns: string
      }
      propose_association_succession: {
        Args: {
          p_candidate_email: string
          p_effective_at?: string
          p_mandate_ends_at: string
          p_organization_id: string
        }
        Returns: string
      }
      propose_bde_recovery: {
        Args: {
          p_candidate_email: string
          p_mandate_ends_at: string
          p_office: string
          p_reason: string
        }
        Returns: string
      }
      propose_bde_succession: {
        Args: {
          p_effective_at?: string
          p_mandate_ends_at: string
          p_president_email: string
          p_vice_president_email: string
        }
        Returns: string
      }
      propose_recruitment_decision: {
        Args: {
          p_application_id: string
          p_message?: string
          p_outcome: string
          p_rationale?: string
        }
        Returns: string
      }
      public_association: { Args: { p_slug: string }; Returns: Json }
      public_association_categories: { Args: never; Returns: Json }
      public_association_events: {
        Args: { p_limit?: number; p_slug: string; p_when?: string }
        Returns: Json
      }
      public_association_posts: {
        Args: { p_limit?: number; p_slug: string }
        Returns: Json
      }
      public_association_recruitment: {
        Args: { p_slug: string }
        Returns: Json
      }
      public_associations: { Args: never; Returns: Json }
      public_event: { Args: { p_slug: string }; Returns: Json }
      public_event_facets: { Args: never; Returns: Json }
      public_event_sitemap: { Args: never; Returns: Json }
      public_events: {
        Args: {
          p_after_at?: string
          p_after_id?: string
          p_availability?: string
          p_category?: string
          p_from?: string
          p_limit?: number
          p_location_type?: string
          p_order?: string
          p_organization_slug?: string
          p_q?: string
          p_to?: string
        }
        Returns: Json
      }
      public_featured_events: { Args: never; Returns: Json }
      public_featured_posts: { Args: never; Returns: Json }
      public_portrait_path: {
        Args: { p_membership_id: string }
        Returns: string
      }
      public_post: { Args: { p_slug: string }; Returns: Json }
      public_post_facets: { Args: never; Returns: Json }
      public_post_sitemap: { Args: never; Returns: Json }
      public_posts: {
        Args: {
          p_before_at?: string
          p_before_id?: string
          p_category?: string
          p_kind?: string
          p_limit?: number
          p_organization_slug?: string
          p_q?: string
        }
        Returns: Json
      }
      public_recruitment_campaign: { Args: { p_slug: string }; Returns: Json }
      public_recruitment_campaigns: {
        Args: {
          p_academic_year?: string
          p_limit?: number
          p_offset?: number
          p_organization_slug?: string
          p_q?: string
          p_view?: string
        }
        Returns: Json
      }
      public_recruitment_facets: { Args: never; Returns: Json }
      public_recruitment_position: {
        Args: { p_campaign_slug: string; p_position_slug: string }
        Returns: Json
      }
      public_recruitment_privacy: { Args: never; Returns: Json }
      public_recruitment_sitemap: { Args: never; Returns: Json }
      public_series_events: { Args: { p_series_key: string }; Returns: Json }
      publish_association_page: {
        Args: { p_expected_revision: number; p_organization_id: string }
        Returns: string
      }
      publish_event: { Args: { p_event_id: string }; Returns: string }
      publish_post: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: string
      }
      publish_recruitment_campaign: {
        Args: { p_campaign_id: string }
        Returns: string
      }
      publish_recruitment_form: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      publish_recruitment_rubric: {
        Args: { p_campaign_id: string; p_kind: string }
        Returns: Json
      }
      record_backup_verification: {
        Args: {
          p_checked_on: string
          p_environment: string
          p_kind: string
          p_method?: string
          p_notes?: string
          p_outcome: string
        }
        Returns: string
      }
      recruitment_application: {
        Args: { p_application_id: string }
        Returns: Json
      }
      recruitment_application_list: {
        Args: {
          p_campaign_id: string
          p_filters?: Json
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
      recruitment_campaign_access: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      recruitment_campaign_board: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      recruitment_committee: { Args: { p_campaign_id: string }; Returns: Json }
      recruitment_dashboard: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      recruitment_decision_board: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      recruitment_document: { Args: { p_document_id: string }; Returns: Json }
      recruitment_editor: { Args: { p_campaign_id: string }; Returns: Json }
      recruitment_export: {
        Args: { p_campaign_id: string; p_position_id?: string }
        Returns: Json
      }
      recruitment_form_preview: {
        Args: { p_campaign_id: string; p_position_id: string; p_which?: string }
        Returns: Json
      }
      recruitment_interview_board: {
        Args: { p_campaign_id: string }
        Returns: Json
      }
      recruitment_review_history: {
        Args: { p_review_id: string }
        Returns: Json
      }
      refresh_application_form: {
        Args: { p_application_id: string }
        Returns: Json
      }
      register_association_media: {
        Args: {
          p_alt_text?: string
          p_bytes: number
          p_height: number
          p_kind: string
          p_media_id: string
          p_organization_id: string
          p_width: number
        }
        Returns: string
      }
      register_for_event: { Args: { p_event_id: string }; Returns: Json }
      release_association_page: {
        Args: { p_organization_id: string; p_reason: string }
        Returns: undefined
      }
      release_recruitment_decisions: {
        Args: {
          p_at?: string
          p_decision_ids: string[]
          p_offer_expires_at?: string
        }
        Returns: Json
      }
      remove_application_document: {
        Args: { p_document_id: string }
        Returns: Json
      }
      remove_association_media: {
        Args: { p_media_id: string }
        Returns: string
      }
      remove_clarification_document: {
        Args: { p_document_id: string }
        Returns: Json
      }
      remove_event_registration: {
        Args: { p_reason: string; p_registration_id: string }
        Returns: undefined
      }
      remove_recruitment_position: {
        Args: { p_position_id: string }
        Returns: string
      }
      renew_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      report_post: {
        Args: { p_details?: string; p_post_id: string; p_reason: string }
        Returns: undefined
      }
      request_clarification: {
        Args: {
          p_allows_documents?: boolean
          p_application_id: string
          p_due_at?: string
          p_question: string
        }
        Returns: string
      }
      reschedule_interview: {
        Args: { p_interview_id: string; p_reason?: string; p_slot_id: string }
        Returns: undefined
      }
      reserve_application_document: {
        Args: {
          p_application_id: string
          p_file_name: string
          p_mime_type: string
          p_question_id: string
          p_size_bytes: number
        }
        Returns: Json
      }
      reserve_clarification_document: {
        Args: {
          p_clarification_id: string
          p_file_name: string
          p_mime_type: string
          p_size_bytes: number
        }
        Returns: Json
      }
      resolve_recruitment_conflict: {
        Args: { p_conflict_id: string; p_reason: string; p_resolution: string }
        Returns: undefined
      }
      respond_to_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string }
        Returns: string
      }
      respond_to_leadership_candidacy: {
        Args: { p_accept: boolean; p_transition_id: string }
        Returns: string
      }
      respond_to_recruitment_offer: {
        Args: { p_accept: boolean; p_note?: string; p_offer_id: string }
        Returns: Json
      }
      restore_event_visibility: {
        Args: { p_event_id: string; p_reason: string }
        Returns: undefined
      }
      restore_post_revision: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: Json
      }
      restore_post_visibility: {
        Args: { p_post_id: string; p_reason: string }
        Returns: undefined
      }
      restore_recruitment_campaign: {
        Args: { p_campaign_id: string; p_reason: string }
        Returns: undefined
      }
      retention_overview: { Args: never; Returns: Json }
      retract_application_comment: {
        Args: { p_comment_id: string }
        Returns: undefined
      }
      retry_notification_delivery: {
        Args: { p_delivery_id: number }
        Returns: undefined
      }
      retry_scheduled_job: { Args: { p_key: string }; Returns: Json }
      return_recruitment_decision: {
        Args: { p_decision_id: string; p_reason: string }
        Returns: undefined
      }
      review_post_revision: {
        Args: {
          p_decision: string
          p_note?: string
          p_post_id: string
          p_revision_id: string
        }
        Returns: undefined
      }
      revoke_delegation: {
        Args: { p_delegation_id: string; p_reason?: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      revoke_recruitment_member: {
        Args: { p_member_id: string; p_reason?: string }
        Returns: undefined
      }
      save_academic_year: {
        Args: {
          p_ends_on: string
          p_handover_starts_on?: string
          p_id: string
          p_label: string
          p_mandate_ends_at: string
          p_mandate_starts_at: string
          p_notes?: string
          p_recruitment_closes_on?: string
          p_recruitment_opens_on?: string
          p_reminder_offsets?: number[]
          p_starts_on: string
        }
        Returns: string
      }
      save_application_answers: {
        Args: { p_answers: Json; p_application_id: string; p_version: number }
        Returns: Json
      }
      save_association_draft: {
        Args: { p_base: Json; p_organization_id: string; p_patch: Json }
        Returns: number
      }
      save_event: {
        Args: { p_event_id: string; p_patch: Json; p_version: number }
        Returns: Json
      }
      save_institutional_record: {
        Args: {
          p_contact: string
          p_key: string
          p_notes?: string
          p_owner: string
          p_provider: string
          p_renewal_on: string
          p_status: string
        }
        Returns: undefined
      }
      save_post_revision: {
        Args: {
          p_content: Json
          p_post_id: string
          p_revision_id: string
          p_version: number
        }
        Returns: Json
      }
      save_recruitment_campaign: {
        Args: { p_campaign_id: string; p_patch: Json; p_version: number }
        Returns: Json
      }
      save_recruitment_form: {
        Args: { p_campaign_id: string; p_edit_version: number; p_schema: Json }
        Returns: Json
      }
      save_recruitment_position: {
        Args: { p_patch: Json; p_position_id: string }
        Returns: undefined
      }
      save_recruitment_review: {
        Args: {
          p_application_id: string
          p_interview_id?: string
          p_note?: string
          p_recommendation?: string
          p_scores?: Json
          p_version?: number
        }
        Returns: Json
      }
      save_recruitment_rubric: {
        Args: {
          p_campaign_id: string
          p_criteria: Json
          p_edit_version: number
          p_kind: string
        }
        Returns: Json
      }
      save_recruitment_template: {
        Args: { p_body: string; p_campaign_id: string; p_kind: string }
        Returns: undefined
      }
      schedule_post: {
        Args: { p_at: string; p_post_id: string; p_revision_id: string }
        Returns: undefined
      }
      security_health: { Args: never; Returns: Json }
      set_application_tag: {
        Args: { p_application_id: string; p_on: boolean; p_tag_id: string }
        Returns: undefined
      }
      set_association_gallery: {
        Args: { p_base: Json; p_items: Json; p_organization_id: string }
        Returns: number
      }
      set_association_team_presentation: {
        Args: { p_base: Json; p_entries: Json; p_organization_id: string }
        Returns: number
      }
      set_editorial_settings: {
        Args: {
          p_organization_id: string
          p_review_mode: string
          p_show_authors: boolean
        }
        Returns: undefined
      }
      set_event_bookmark: {
        Args: { p_event_id: string; p_saved: boolean }
        Returns: undefined
      }
      set_event_pin: {
        Args: { p_event_id: string; p_pinned: boolean }
        Returns: undefined
      }
      set_event_prominence: {
        Args: { p_event_id: string; p_prominence: string; p_until?: string }
        Returns: undefined
      }
      set_handover_item: {
        Args: {
          p_assignee_user_id?: string
          p_done: boolean
          p_item_key: string
          p_note?: string
          p_organization_id: string
        }
        Returns: undefined
      }
      set_membership_status: {
        Args: { p_membership_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_my_public_team_profile: {
        Args: {
          p_bio?: string
          p_hidden: boolean
          p_membership_id: string
          p_show_photo: boolean
        }
        Returns: undefined
      }
      set_notification_preference: {
        Args: { p_email: boolean; p_in_app: boolean; p_topic: string }
        Returns: Json
      }
      set_notification_settings: {
        Args: {
          p_quiet_end: string
          p_quiet_hours: boolean
          p_quiet_start: string
          p_timezone: string
        }
        Returns: undefined
      }
      set_organization_status: {
        Args: { p_organization_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_post_campaign: {
        Args: { p_campaign_id: string; p_post_id: string }
        Returns: undefined
      }
      set_post_event: {
        Args: { p_event_id: string; p_post_id: string }
        Returns: undefined
      }
      set_post_pin: {
        Args: { p_pinned: boolean; p_post_id: string }
        Returns: undefined
      }
      set_post_prominence: {
        Args: { p_post_id: string; p_prominence: string; p_until?: string }
        Returns: undefined
      }
      set_recruitment_decision_message: {
        Args: { p_decision_id: string; p_message: string }
        Returns: undefined
      }
      set_recruitment_review_policy: {
        Args: {
          p_approval_policy: string
          p_campaign_id: string
          p_required_reviews: number
        }
        Returns: undefined
      }
      set_recruitment_settings: {
        Args: {
          p_draft_months: number
          p_privacy_contact: string
          p_privacy_notice: string
          p_selected_months?: number
          p_submitted_months: number
          p_withdrawn_months: number
        }
        Returns: undefined
      }
      set_recruitment_status: {
        Args: { p_campaign_id: string; p_status: string }
        Returns: string
      }
      set_retention_policy: {
        Args: {
          p_confirm_count?: number
          p_key: string
          p_months: number
          p_note?: string
        }
        Returns: Json
      }
      start_application: { Args: { p_position_id: string }; Returns: Json }
      start_recruitment_onboarding: {
        Args: {
          p_mandate_ends_at?: string
          p_offer_id: string
          p_position_id?: string
        }
        Returns: string
      }
      submit_application: {
        Args: {
          p_application_id: string
          p_privacy_acknowledged: boolean
          p_version: number
        }
        Returns: Json
      }
      submit_notification_broadcast: {
        Args: { p_id: string; p_scheduled_at?: string }
        Returns: Json
      }
      submit_post_revision: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: undefined
      }
      submit_recruitment_review: {
        Args: { p_review_id: string; p_version: number }
        Returns: Json
      }
      transfer_review_assignments: {
        Args: {
          p_campaign_id: string
          p_from_member_id: string
          p_reason: string
          p_to_member_id: string
        }
        Returns: Json
      }
      unassign_recruitment_review: {
        Args: { p_assignment_id: string }
        Returns: undefined
      }
      unpublish_association_page: {
        Args: { p_organization_id: string; p_reason?: string }
        Returns: undefined
      }
      unpublish_event: {
        Args: { p_event_id: string; p_reason?: string }
        Returns: undefined
      }
      unpublish_post: {
        Args: { p_post_id: string; p_reason?: string }
        Returns: undefined
      }
      unpublish_recruitment_campaign: {
        Args: { p_campaign_id: string; p_reason?: string }
        Returns: undefined
      }
      unsubscribe_with_token: { Args: { p_token: string }; Returns: Json }
      update_association_category: {
        Args: {
          p_archived: boolean
          p_category_id: string
          p_label: string
          p_sort_order: number
        }
        Returns: undefined
      }
      update_association_media: {
        Args: { p_alt_text: string; p_media_id: string }
        Returns: undefined
      }
      update_event_category: {
        Args: {
          p_archived: boolean
          p_category_id: string
          p_label: string
          p_sort_order: number
        }
        Returns: undefined
      }
      update_interview_slot: {
        Args: {
          p_instructions: string
          p_location: string
          p_meeting_link: string
          p_member_ids: string[]
          p_slot_id: string
        }
        Returns: undefined
      }
      update_operational_incident: {
        Args: {
          p_id: string
          p_keep_owner?: boolean
          p_note: string
          p_severity?: string
          p_status: string
        }
        Returns: undefined
      }
      update_position: {
        Args: {
          p_description?: string
          p_permissions?: string[]
          p_position_id: string
          p_title: string
        }
        Returns: undefined
      }
      update_post_category: {
        Args: {
          p_archived: boolean
          p_category_id: string
          p_label: string
          p_sort_order: number
        }
        Returns: undefined
      }
      update_recruitment_member: {
        Args: {
          p_ends_at?: string
          p_member_id: string
          p_position_ids?: string[]
          p_powers: string[]
          p_role: string
          p_scope: string
        }
        Returns: undefined
      }
      withdraw_application: {
        Args: { p_application_id: string; p_reason?: string }
        Returns: Json
      }
      withdraw_bde_approval: {
        Args: { p_transition_id: string }
        Returns: undefined
      }
      withdraw_post_revision: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: undefined
      }
      withdraw_recruitment_offer: {
        Args: { p_offer_id: string; p_reason: string }
        Returns: undefined
      }
      withhold_association_page: {
        Args: { p_organization_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
