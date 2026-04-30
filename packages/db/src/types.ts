export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      batches: {
        Row: {
          available_units: number
          coa_url: string | null
          contamination_check: Database["public"]["Enums"]["contamination_result"]
          created_at: string
          harvest_date: string | null
          id: string
          inoculation_date: string
          species_id: string
          storage_zone: string | null
          substrate_lot: string
          updated_at: string
          yield_kg: number | null
        }
        Insert: {
          available_units?: number
          coa_url?: string | null
          contamination_check?: Database["public"]["Enums"]["contamination_result"]
          created_at?: string
          harvest_date?: string | null
          id?: string
          inoculation_date: string
          species_id: string
          storage_zone?: string | null
          substrate_lot: string
          updated_at?: string
          yield_kg?: number | null
        }
        Update: {
          available_units?: number
          coa_url?: string | null
          contamination_check?: Database["public"]["Enums"]["contamination_result"]
          created_at?: string
          harvest_date?: string | null
          id?: string
          inoculation_date?: string
          species_id?: string
          storage_zone?: string | null
          substrate_lot?: string
          updated_at?: string
          yield_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          items: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          items?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          items?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          contact_email: string
          created_at: string
          id: string
          name: string
          net30_enabled: boolean
          shipping_address: Json
          stripe_customer_id: string | null
          tier: Database["public"]["Enums"]["company_tier"]
          updated_at: string
        }
        Insert: {
          contact_email: string
          created_at?: string
          id?: string
          name: string
          net30_enabled?: boolean
          shipping_address?: Json
          stripe_customer_id?: string | null
          tier?: Database["public"]["Enums"]["company_tier"]
          updated_at?: string
        }
        Update: {
          contact_email?: string
          created_at?: string
          id?: string
          name?: string
          net30_enabled?: boolean
          shipping_address?: Json
          stripe_customer_id?: string | null
          tier?: Database["public"]["Enums"]["company_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_user_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          allocated_at: string | null
          batch_id: string | null
          created_at: string
          format: Database["public"]["Enums"]["product_format"]
          id: string
          order_id: string
          quantity: number
          species_id: string
          unit_price: number
        }
        Insert: {
          allocated_at?: string | null
          batch_id?: string | null
          created_at?: string
          format: Database["public"]["Enums"]["product_format"]
          id?: string
          order_id: string
          quantity: number
          species_id: string
          unit_price: number
        }
        Update: {
          allocated_at?: string | null
          batch_id?: string | null
          created_at?: string
          format?: Database["public"]["Enums"]["product_format"]
          id?: string
          order_id?: string
          quantity?: number
          species_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string
          created_at: string
          dispatch_date: string | null
          id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["order_status"]
          stripe_session_id: string | null
          subscription_id: string | null
          total_price: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          dispatch_date?: string | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          stripe_session_id?: string | null
          subscription_id?: string | null
          total_price?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          dispatch_date?: string | null
          id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          stripe_session_id?: string | null
          subscription_id?: string | null
          total_price?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          line_items: Json
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          line_items?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          line_items?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      species: {
        Row: {
          cold_chain_required: boolean
          common_name: string
          created_at: string
          datasheet_url: string | null
          dispatch_window: string[]
          id: string
          latin_name: string
          shelf_life_days: number
          substrate_type: string
          updated_at: string
        }
        Insert: {
          cold_chain_required?: boolean
          common_name: string
          created_at?: string
          datasheet_url?: string | null
          dispatch_window?: string[]
          id?: string
          latin_name: string
          shelf_life_days: number
          substrate_type: string
          updated_at?: string
        }
        Update: {
          cold_chain_required?: boolean
          common_name?: string
          created_at?: string
          datasheet_url?: string | null
          dispatch_window?: string[]
          id?: string
          latin_name?: string
          shelf_life_days?: number
          substrate_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          format: Database["public"]["Enums"]["product_format"]
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          id: string
          next_dispatch: string
          priority_tier: number
          quantity: number
          species_id: string
          stripe_sub_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          format: Database["public"]["Enums"]["product_format"]
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          next_dispatch: string
          priority_tier?: number
          quantity: number
          species_id: string
          stripe_sub_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          format?: Database["public"]["Enums"]["product_format"]
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: string
          next_dispatch?: string
          priority_tier?: number
          quantity?: number
          species_id?: string
          stripe_sub_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_species_id_fkey"
            columns: ["species_id"]
            isOneToOne: false
            referencedRelation: "species"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_batch: {
        Args: { p_qty: number; p_species_id: string }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      handle_jwt: { Args: { event: Json }; Returns: Json }
      validate_dispatch_window: { Args: { days: string[] }; Returns: boolean }
    }
    Enums: {
      company_tier: "spot" | "agreement" | "oem"
      company_user_role: "buyer" | "admin"
      contamination_result: "pending" | "pass" | "fail"
      order_status:
        | "pending"
        | "confirmed"
        | "picking"
        | "dispatched"
        | "delivered"
        | "cancelled"
      payment_method: "card" | "net30"
      product_format: "fresh" | "powder" | "spawn" | "culture" | "block"
      quote_status: "draft" | "sent" | "approved" | "expired" | "cancelled"
      subscription_frequency: "weekly" | "biweekly" | "monthly"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      company_tier: ["spot", "agreement", "oem"],
      company_user_role: ["buyer", "admin"],
      contamination_result: ["pending", "pass", "fail"],
      order_status: [
        "pending",
        "confirmed",
        "picking",
        "dispatched",
        "delivered",
        "cancelled",
      ],
      payment_method: ["card", "net30"],
      product_format: ["fresh", "powder", "spawn", "culture", "block"],
      quote_status: ["draft", "sent", "approved", "expired", "cancelled"],
      subscription_frequency: ["weekly", "biweekly", "monthly"],
    },
  },
} as const

