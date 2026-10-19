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
      organizations: {
        Row: {
          accent: string
          archived_at: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          name: string
          short_name: string | null
          slug: string
          status: string
          status_reason: string | null
          tagline: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          accent?: string
          archived_at?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          name: string
          short_name?: string | null
          slug: string
          status?: string
          status_reason?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          accent?: string
          archived_at?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          name?: string
          short_name?: string | null
          slug?: string
          status?: string
          status_reason?: string | null
          tagline?: string | null
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
      assign_position: {
        Args: {
          p_ends_at: string
          p_membership_id: string
          p_position_id: string
          p_starts_at?: string
        }
        Returns: string
      }
      cancel_leadership_transition: {
        Args: { p_reason?: string; p_transition_id: string }
        Returns: undefined
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
      my_access: { Args: never; Returns: Json }
      my_governance_inbox: { Args: never; Returns: Json }
      organization_governance: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      organization_team: { Args: { p_organization_id: string }; Returns: Json }
      platform_organizations: { Args: never; Returns: Json }
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
      respond_to_invitation: {
        Args: { p_accept: boolean; p_invitation_id: string }
        Returns: string
      }
      respond_to_leadership_candidacy: {
        Args: { p_accept: boolean; p_transition_id: string }
        Returns: string
      }
      revoke_delegation: {
        Args: { p_delegation_id: string; p_reason?: string }
        Returns: undefined
      }
      revoke_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_membership_status: {
        Args: { p_membership_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_organization_status: {
        Args: { p_organization_id: string; p_reason?: string; p_status: string }
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
      withdraw_bde_approval: {
        Args: { p_transition_id: string }
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
