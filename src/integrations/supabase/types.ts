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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      batches: {
        Row: {
          batch_code: string
          created_at: string
          expiry_date: string | null
          id: string
          manufacture_date: string | null
          manufacturer_id: string
          metadata: Json | null
          name: string
          product_count: number
        }
        Insert: {
          batch_code: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          manufacture_date?: string | null
          manufacturer_id: string
          metadata?: Json | null
          name: string
          product_count?: number
        }
        Update: {
          batch_code?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          manufacture_date?: string | null
          manufacturer_id?: string
          metadata?: Json | null
          name?: string
          product_count?: number
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          day: string
          products_created: number
          scans: number
          events: number
          alerts: number
          new_users: number
          updated_at: string
        }
        Insert: {
          day: string
          products_created?: number
          scans?: number
          events?: number
          alerts?: number
          new_users?: number
          updated_at?: string
        }
        Update: {
          day?: string
          products_created?: number
          scans?: number
          events?: number
          alerts?: number
          new_users?: number
          updated_at?: string
        }
        Relationships: []
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string
          id: string
          is_resolved: boolean
          metadata: Json | null
          product_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          description: string
          id?: string
          is_resolved?: boolean
          metadata?: Json | null
          product_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          is_resolved?: boolean
          metadata?: Json | null
          product_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link_url: string | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link_url?: string | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ownership_transfers: {
        Row: {
          created_at: string
          from_user_id: string | null
          id: string
          notes: string | null
          product_id: string
          status: string
          to_user_id: string
          transfer_hash: string
          transfer_type: string
        }
        Insert: {
          created_at?: string
          from_user_id?: string | null
          id?: string
          notes?: string | null
          product_id: string
          status?: string
          to_user_id: string
          transfer_hash: string
          transfer_type?: string
        }
        Update: {
          created_at?: string
          from_user_id?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          status?: string
          to_user_id?: string
          transfer_hash?: string
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ownership_transfers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          batch_id: string | null
          blockchain_tx: string | null
          blockchain_tx_status: string | null
          brand: string
          category: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          current_owner_id: string | null
          description: string | null
          expiry_date: string | null
          flag_reason: string | null
          id: string
          image_url: string | null
          is_claimed: boolean
          is_flagged: boolean
          manufacture_date: string | null
          manufacturer_id: string
          metadata: Json | null
          name: string
          origin_country: string | null
          product_code: string
          qr_data: string
          scan_status: string
          secure_token: string
          status: string
          trust_score: number
          updated_at: string
          verification_hash: string
        }
        Insert: {
          batch_id?: string | null
          blockchain_tx?: string | null
          blockchain_tx_status?: string | null
          brand: string
          category?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          current_owner_id?: string | null
          description?: string | null
          expiry_date?: string | null
          flag_reason?: string | null
          id?: string
          image_url?: string | null
          is_claimed?: boolean
          is_flagged?: boolean
          manufacture_date?: string | null
          manufacturer_id: string
          metadata?: Json | null
          name: string
          origin_country?: string | null
          product_code: string
          qr_data: string
          scan_status?: string
          secure_token?: string
          status?: string
          trust_score?: number
          updated_at?: string
          verification_hash: string
        }
        Update: {
          batch_id?: string | null
          blockchain_tx?: string | null
          blockchain_tx_status?: string | null
          brand?: string
          category?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          current_owner_id?: string | null
          description?: string | null
          expiry_date?: string | null
          flag_reason?: string | null
          id?: string
          image_url?: string | null
          is_claimed?: boolean
          is_flagged?: boolean
          manufacture_date?: string | null
          manufacturer_id?: string
          metadata?: Json | null
          name?: string
          origin_country?: string | null
          product_code?: string
          qr_data?: string
          scan_status?: string
          secure_token?: string
          status?: string
          trust_score?: number
          updated_at?: string
          verification_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string
          id: string
          is_verified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_verified?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scan_logs: {
        Row: {
          created_at: string
          device_hash: string | null
          id: string
          ip_address: string | null
          is_suspicious: boolean
          latitude: number | null
          longitude: number | null
          product_id: string
          scan_lat: number | null
          scan_lng: number | null
          scan_location: string | null
          scanner_id: string | null
          suspicion_reason: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_hash?: string | null
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean
          latitude?: number | null
          longitude?: number | null
          product_id: string
          scan_lat?: number | null
          scan_lng?: number | null
          scan_location?: string | null
          scanner_id?: string | null
          suspicion_reason?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_hash?: string | null
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean
          latitude?: number | null
          longitude?: number | null
          product_id?: string
          scan_lat?: number | null
          scan_lng?: number | null
          scan_location?: string | null
          scanner_id?: string | null
          suspicion_reason?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supply_chain_events: {
        Row: {
          actor_id: string
          created_at: string
          event_hash: string
          event_type: string
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          metadata: Json | null
          notes: string | null
          previous_event_hash: string | null
          product_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_hash: string
          event_type: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          metadata?: Json | null
          notes?: string | null
          previous_event_hash?: string | null
          product_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_hash?: string
          event_type?: string
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          metadata?: Json | null
          notes?: string | null
          previous_event_hash?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supply_chain_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_addresses: {
        Row: {
          id: string
          user_id: string
          wallet_address: string
          chain_id: number
          verified: boolean
          verified_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          wallet_address: string
          chain_id?: number
          verified?: boolean
          verified_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          wallet_address?: string
          chain_id?: number
          verified?: boolean
          verified_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_nonces: {
        Row: {
          id: string
          wallet_address: string
          nonce: string
          expires_at: string
          consumed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          wallet_address: string
          nonce: string
          expires_at: string
          consumed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          wallet_address?: string
          nonce?: string
          expires_at?: string
          consumed_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_nonces_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "wallet_addresses"
            referencedColumns: ["wallet_address"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_change_role: {
        Args: {
          p_target_user_id: string
          p_new_role: string
        }
        Returns: Json
      }
      anchor_to_blockchain: {
        Args: {
          p_product_id: string
        }
        Returns: Json
      }
      expire_products_daily: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      has_role: {
        Args: {
          _user_id: string
          _role: string
        }
        Returns: boolean
      }
      link_wallet_address: {
        Args: {
          p_wallet_address: string
          p_nonce: string
          p_signature: string
          p_chain_id?: number
        }
        Returns: Json
      }
      log_product_scan: {
        Args: {
          p_product_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      record_blockchain_anchor: {
        Args: {
          p_product_id: string
          p_tx_hash: string
          p_status?: string
        }
        Returns: Json
      }
      record_supply_chain_event: {
        Args: {
          p_product_id: string
          p_event_type: string
          p_location?: string | null
          p_latitude?: number | null
          p_longitude?: number | null
          p_notes?: string | null
        }
        Returns: Json
      }
      refresh_daily_stats: {
        Args: {
          p_days?: number
        }
        Returns: undefined
      }
      request_wallet_nonce: {
        Args: {
          p_wallet_address: string
        }
        Returns: string
      }
      system_actor_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      transfer_product_ownership: {
        Args: {
          p_product_id: string
          p_to_email: string
          p_transfer_type?: string
          p_notes?: string
        }
        Returns: Json
      }
      unlink_wallet_address: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      resolve_fraud_alert: {
        Args: { p_alert_id: string }
        Returns: Json
      }
      verify_product_secure: {
        Args: {
          p_product_code: string
          p_lat?: number
          p_lng?: number
          p_user_agent?: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "manufacturer" | "supplier" | "customer" | "admin"
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
      app_role: ["manufacturer", "supplier", "customer", "admin"],
    },
  },
} as const