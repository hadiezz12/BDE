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
          search?: unknown
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
          search?: unknown
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_bde_succession: {
        Args: { p_transition_id: string }
        Returns: string
      }
      archive_position: {
        Args: { p_position_id: string; p_reason: string }
        Returns: undefined
      }
      archive_post: {
        Args: { p_archive?: boolean; p_post_id: string }
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
      association_editor: { Args: { p_organization_id: string }; Returns: Json }
      association_preview: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      cancel_leadership_transition: {
        Args: { p_reason?: string; p_transition_id: string }
        Returns: undefined
      }
      cancel_post_schedule: { Args: { p_post_id: string }; Returns: undefined }
      change_organization_slug: {
        Args: { p_organization_id: string; p_slug: string }
        Returns: string
      }
      change_post_slug: {
        Args: { p_post_id: string; p_slug: string }
        Returns: string
      }
      content_dashboard: { Args: { p_organization_id: string }; Returns: Json }
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
      delete_post_draft: { Args: { p_post_id: string }; Returns: undefined }
      dismiss_report: {
        Args: { p_note?: string; p_report_id: string }
        Returns: undefined
      }
      end_assignment: {
        Args: { p_assignment_id: string; p_reason?: string }
        Returns: undefined
      }
      end_office_mandate: {
        Args: { p_assignment_id: string; p_reason: string }
        Returns: undefined
      }
      governance_history: {
        Args: { p_limit?: number; p_organization_id?: string }
        Returns: Json
      }
      governance_overview: { Args: never; Returns: Json }
      hide_post: {
        Args: { p_post_id: string; p_reason: string }
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
      member_access: { Args: { p_membership_id: string }; Returns: Json }
      moderated_post: { Args: { p_post_id: string }; Returns: Json }
      moderation_queue: { Args: never; Returns: Json }
      my_access: { Args: never; Returns: Json }
      my_governance_inbox: { Args: never; Returns: Json }
      organization_governance: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      organization_team: { Args: { p_organization_id: string }; Returns: Json }
      platform_organizations: { Args: never; Returns: Json }
      post_editor: { Args: { p_post_id: string }; Returns: Json }
      post_preview: {
        Args: { p_post_id: string; p_revision_id?: string }
        Returns: Json
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
      public_association: { Args: { p_slug: string }; Returns: Json }
      public_association_categories: { Args: never; Returns: Json }
      public_association_posts: {
        Args: { p_limit?: number; p_slug: string }
        Returns: Json
      }
      public_associations: { Args: never; Returns: Json }
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
      publish_association_page: {
        Args: { p_expected_revision: number; p_organization_id: string }
        Returns: string
      }
      publish_post: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: string
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
      release_association_page: {
        Args: { p_organization_id: string; p_reason: string }
        Returns: undefined
      }
      remove_association_media: {
        Args: { p_media_id: string }
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
      respond_to_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string }
        Returns: string
      }
      respond_to_leadership_candidacy: {
        Args: { p_accept: boolean; p_transition_id: string }
        Returns: string
      }
      restore_post_revision: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: Json
      }
      restore_post_visibility: {
        Args: { p_post_id: string; p_reason: string }
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
      save_association_draft: {
        Args: { p_base: Json; p_organization_id: string; p_patch: Json }
        Returns: number
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
      schedule_post: {
        Args: { p_at: string; p_post_id: string; p_revision_id: string }
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
      set_organization_status: {
        Args: { p_organization_id: string; p_reason?: string; p_status: string }
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
      submit_post_revision: {
        Args: { p_post_id: string; p_revision_id: string }
        Returns: undefined
      }
      unpublish_association_page: {
        Args: { p_organization_id: string; p_reason?: string }
        Returns: undefined
      }
      unpublish_post: {
        Args: { p_post_id: string; p_reason?: string }
        Returns: undefined
      }
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
      withdraw_bde_approval: {
        Args: { p_transition_id: string }
        Returns: undefined
      }
      withdraw_post_revision: {
        Args: { p_post_id: string; p_revision_id: string }
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
