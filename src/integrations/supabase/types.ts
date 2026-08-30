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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abandoned_carts: {
        Row: {
          address: Json | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          items: Json
          last_activity_at: string
          notes: string | null
          phone_e164: string
          recovered_at: string | null
          recovered_order_id: string | null
          reminder_count: number
          reminder_sent_at: string | null
          store_id: string
          subtotal: number
          token: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          items?: Json
          last_activity_at?: string
          notes?: string | null
          phone_e164: string
          recovered_at?: string | null
          recovered_order_id?: string | null
          reminder_count?: number
          reminder_sent_at?: string | null
          store_id: string
          subtotal?: number
          token?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          items?: Json
          last_activity_at?: string
          notes?: string | null
          phone_e164?: string
          recovered_at?: string | null
          recovered_order_id?: string | null
          reminder_count?: number
          reminder_sent_at?: string | null
          store_id?: string
          subtotal?: number
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_recovered_order_id_fkey"
            columns: ["recovered_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_carts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          rate_limit_per_minute: number
          requests_count: number
          revoked_at: string | null
          rotated_from: string | null
          scopes: string[]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          rate_limit_per_minute?: number
          requests_count?: number
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          rate_limit_per_minute?: number
          requests_count?: number
          revoked_at?: string | null
          rotated_from?: string | null
          scopes?: string[]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          duration_ms: number
          error: string | null
          id: string
          ip: string | null
          method: string
          path: string
          status: number
          store_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          ip?: string | null
          method: string
          path: string
          status: number
          store_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number
          error?: string | null
          id?: string
          ip?: string | null
          method?: string
          path?: string
          status?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminder_queue: {
        Row: {
          appointment_id: string
          attempts: number
          created_at: string
          id: string
          kind: string
          last_error: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminder_queue_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reminder_queue_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_waitlist: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          notified_at: string | null
          preferred_date: string | null
          preferred_period: string | null
          product_id: string | null
          professional_id: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          preferred_date?: string | null
          preferred_period?: string | null
          product_id?: string | null
          professional_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          preferred_date?: string | null
          preferred_period?: string | null
          product_id?: string | null
          professional_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_waitlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          charged_amount: number
          commission_rate: number
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deposit_amount: number
          deposit_status: string
          ends_at: string | null
          id: string
          is_demo: boolean
          notes: string | null
          payout_closed_at: string | null
          payout_status: string
          previous_starts_at: string | null
          price: number
          product_id: string | null
          professional_id: string | null
          refunded_amount: number
          reminder_24h_sent_at: string | null
          reminder_2h_sent_at: string | null
          reschedule_count: number
          rescheduled_at: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          store_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          charged_amount?: number
          commission_rate?: number
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deposit_amount?: number
          deposit_status?: string
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          payout_closed_at?: string | null
          payout_status?: string
          previous_starts_at?: string | null
          price?: number
          product_id?: string | null
          professional_id?: string | null
          refunded_amount?: number
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          reschedule_count?: number
          rescheduled_at?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          store_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          charged_amount?: number
          commission_rate?: number
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deposit_amount?: number
          deposit_status?: string
          ends_at?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          payout_closed_at?: string | null
          payout_status?: string
          previous_starts_at?: string | null
          price?: number
          product_id?: string | null
          professional_id?: string | null
          refunded_amount?: number
          reminder_24h_sent_at?: string | null
          reminder_2h_sent_at?: string | null
          reschedule_count?: number
          rescheduled_at?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          store_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          channel: string
          created_at: string
          delay_minutes: number
          event: string
          id: string
          is_active: boolean
          respect_business_hours: boolean
          store_id: string
          template_key: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          delay_minutes?: number
          event: string
          id?: string
          is_active?: boolean
          respect_business_hours?: boolean
          store_id: string
          template_key: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          delay_minutes?: number
          event?: string
          id?: string
          is_active?: boolean
          respect_business_hours?: boolean
          store_id?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          method: string
          order_id: string | null
          reason: string | null
          session_id: string
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          method?: string
          order_id?: string | null
          reason?: string | null
          session_id: string
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          method?: string
          order_id?: string | null
          reason?: string | null
          session_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          counted_balance: number | null
          created_at: string
          difference: number | null
          expected_balance: number | null
          id: string
          justification: string | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_balance: number
          status: string
          store_id: string
          terminal: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          counted_balance?: number | null
          created_at?: string
          difference?: number | null
          expected_balance?: number | null
          id?: string
          justification?: string | null
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_balance?: number
          status?: string
          store_id: string
          terminal?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          counted_balance?: number | null
          created_at?: string
          difference?: number | null
          expected_balance?: number | null
          id?: string
          justification?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_balance?: number
          status?: string
          store_id?: string
          terminal?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_credentials: {
        Row: {
          access_token: string | null
          app_secret: string | null
          channel: string
          created_at: string
          extra: Json
          id: string
          store_id: string
          updated_at: string
          verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          app_secret?: string | null
          channel: string
          created_at?: string
          extra?: Json
          id?: string
          store_id: string
          updated_at?: string
          verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          app_secret?: string | null
          channel?: string
          created_at?: string
          extra?: Json
          id?: string
          store_id?: string
          updated_at?: string
          verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_credentials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_settings: {
        Row: {
          account_id: string | null
          ai_assistant_enabled: boolean
          away_message: string | null
          bot_username: string | null
          business_hours: Json
          channel: string
          created_at: string
          demo_mode: boolean
          display_number: string | null
          from_email: string | null
          has_token: boolean
          has_verify_token: boolean
          id: string
          is_enabled: boolean
          last_test_at: string | null
          last_test_message: string | null
          last_test_ok: boolean | null
          max_messages_per_hour: number
          phone_number_id: string | null
          store_id: string
          token_hint: string | null
          transcription_enabled: boolean
          updated_at: string
          webhook_path: string | null
        }
        Insert: {
          account_id?: string | null
          ai_assistant_enabled?: boolean
          away_message?: string | null
          bot_username?: string | null
          business_hours?: Json
          channel: string
          created_at?: string
          demo_mode?: boolean
          display_number?: string | null
          from_email?: string | null
          has_token?: boolean
          has_verify_token?: boolean
          id?: string
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          max_messages_per_hour?: number
          phone_number_id?: string | null
          store_id: string
          token_hint?: string | null
          transcription_enabled?: boolean
          updated_at?: string
          webhook_path?: string | null
        }
        Update: {
          account_id?: string | null
          ai_assistant_enabled?: boolean
          away_message?: string | null
          bot_username?: string | null
          business_hours?: Json
          channel?: string
          created_at?: string
          demo_mode?: boolean
          display_number?: string | null
          from_email?: string | null
          has_token?: boolean
          has_verify_token?: boolean
          id?: string
          is_enabled?: boolean
          last_test_at?: string | null
          last_test_message?: string | null
          last_test_ok?: boolean | null
          max_messages_per_hour?: number
          phone_number_id?: string | null
          store_id?: string
          token_hint?: string | null
          transcription_enabled?: boolean
          updated_at?: string
          webhook_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_webhook_events: {
        Row: {
          channel: string
          created_at: string
          error: string | null
          event_id: string
          id: string
          payload: Json
          processed_at: string | null
          store_id: string | null
        }
        Insert: {
          channel: string
          created_at?: string
          error?: string | null
          event_id: string
          id?: string
          payload?: Json
          processed_at?: string | null
          store_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          error?: string | null
          event_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_webhook_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_events: {
        Row: {
          affiliate_code: string | null
          amount: number
          coupon_code: string | null
          created_at: string
          id: string
          kind: string
          offer_id: string | null
          order_id: string | null
          session_key: string | null
          store_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          affiliate_code?: string | null
          amount?: number
          coupon_code?: string | null
          created_at?: string
          id?: string
          kind: string
          offer_id?: string | null
          order_id?: string | null
          session_key?: string | null
          store_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          affiliate_code?: string | null
          amount?: number
          coupon_code?: string | null
          created_at?: string
          id?: string
          kind?: string
          offer_id?: string | null
          order_id?: string | null
          session_key?: string | null
          store_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "checkout_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_offers: {
        Row: {
          conversions: number
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          impressions: number
          is_active: boolean
          kind: string
          product_id: string
          sort_order: number
          store_id: string
          title: string
          trigger_product_id: string | null
          updated_at: string
        }
        Insert: {
          conversions?: number
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          impressions?: number
          is_active?: boolean
          kind?: string
          product_id: string
          sort_order?: number
          store_id: string
          title: string
          trigger_product_id?: string | null
          updated_at?: string
        }
        Update: {
          conversions?: number
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          impressions?: number
          is_active?: boolean
          kind?: string
          product_id?: string
          sort_order?: number
          store_id?: string
          title?: string
          trigger_product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_offers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_offers_trigger_product_id_fkey"
            columns: ["trigger_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          created_at: string
          granted: boolean
          id: string
          kind: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted?: boolean
          id?: string
          kind: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted?: boolean
          id?: string
          kind?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_consents: {
        Row: {
          channel: string
          contact: string
          created_at: string
          id: string
          opted_in: boolean
          opted_in_at: string | null
          opted_out_at: string | null
          source: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          contact: string
          created_at?: string
          id?: string
          opted_in?: boolean
          opted_in_at?: string | null
          opted_out_at?: string | null
          source?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          contact?: string
          created_at?: string
          id?: string
          opted_in?: boolean
          opted_in_at?: string | null
          opted_out_at?: string | null
          source?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_consents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          contact: string | null
          contact_name: string | null
          created_at: string
          customer_id: string | null
          external_id: string | null
          human_takeover: boolean
          id: string
          is_demo: boolean
          last_message_at: string | null
          status: string
          store_id: string
          subject: string | null
          tags: string[]
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          contact?: string | null
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          external_id?: string | null
          human_takeover?: boolean
          id?: string
          is_demo?: boolean
          last_message_at?: string | null
          status?: string
          store_id: string
          subject?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          contact?: string | null
          contact_name?: string | null
          created_at?: string
          customer_id?: string | null
          external_id?: string | null
          human_takeover?: boolean
          id?: string
          is_demo?: boolean
          last_message_at?: string | null
          status?: string
          store_id?: string
          subject?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          areas: string[]
          created_at: string
          document: string | null
          id: string
          is_active: boolean
          is_online: boolean
          name: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          plate: string | null
          store_id: string
          updated_at: string
          user_id: string | null
          vehicle: string
        }
        Insert: {
          areas?: string[]
          created_at?: string
          document?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          plate?: string | null
          store_id: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string
        }
        Update: {
          areas?: string[]
          created_at?: string
          document?: string | null
          id?: string
          is_active?: boolean
          is_online?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          plate?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string | null
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: "couriers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaign_sends: {
        Row: {
          body: string | null
          campaign_id: string
          channel: string
          contact: string | null
          customer_id: string | null
          id: string
          reason: string | null
          sent_at: string
          status: string
          store_id: string
        }
        Insert: {
          body?: string | null
          campaign_id: string
          channel: string
          contact?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
          sent_at?: string
          status?: string
          store_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string
          channel?: string
          contact?: string | null
          customer_id?: string | null
          id?: string
          reason?: string | null
          sent_at?: string
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaign_sends_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaign_sends_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaigns: {
        Row: {
          bonus_points: number
          channels: string[]
          created_at: string
          ends_at: string | null
          frequency_cap_days: number
          id: string
          is_demo: boolean
          last_run_at: string | null
          message_body: string
          name: string
          reward_id: string | null
          segment: string
          segment_config: Json
          sent_count: number
          skipped_count: number
          starts_at: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          bonus_points?: number
          channels?: string[]
          created_at?: string
          ends_at?: string | null
          frequency_cap_days?: number
          id?: string
          is_demo?: boolean
          last_run_at?: string | null
          message_body?: string
          name: string
          reward_id?: string | null
          segment?: string
          segment_config?: Json
          sent_count?: number
          skipped_count?: number
          starts_at?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          bonus_points?: number
          channels?: string[]
          created_at?: string
          ends_at?: string | null
          frequency_cap_days?: number
          id?: string
          is_demo?: boolean
          last_run_at?: string | null
          message_body?: string
          name?: string
          reward_id?: string | null
          segment?: string
          segment_config?: Json
          sent_count?: number
          skipped_count?: number
          starts_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaigns_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_tokens: {
        Row: {
          created_at: string
          last_result: Json | null
          last_run_at: string | null
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          last_result?: Json | null
          last_run_at?: string | null
          name: string
          token: string
        }
        Update: {
          created_at?: string
          last_result?: Json | null
          last_run_at?: string | null
          name?: string
          token?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          city: string | null
          complement: string | null
          created_at: string
          customer_id: string
          district: string | null
          id: string
          is_default: boolean
          label: string | null
          latitude: number | null
          longitude: number | null
          number: string | null
          reference: string | null
          state: string | null
          store_id: string
          street: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          complement?: string | null
          created_at?: string
          customer_id: string
          district?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          number?: string | null
          reference?: string | null
          state?: string | null
          store_id: string
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          complement?: string | null
          created_at?: string
          customer_id?: string
          district?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          number?: string | null
          reference?: string | null
          state?: string | null
          store_id?: string
          street?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_blocks: {
        Row: {
          blocked_at: string
          blocked_by: string | null
          created_at: string
          customer_id: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          phone: string
          reason: string
          store_id: string
          unblock_reason: string | null
          unblocked_at: string | null
          unblocked_by: string | null
          updated_at: string
        }
        Insert: {
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          phone: string
          reason: string
          store_id: string
          unblock_reason?: string | null
          unblocked_at?: string | null
          unblocked_by?: string | null
          updated_at?: string
        }
        Update: {
          blocked_at?: string
          blocked_by?: string | null
          created_at?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          phone?: string
          reason?: string
          store_id?: string
          unblock_reason?: string | null
          unblocked_at?: string | null
          unblocked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_blocks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_blocks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_consents: {
        Row: {
          accepted: boolean
          created_at: string
          customer_id: string | null
          id: string
          kind: string
          phone_e164: string | null
          source: string | null
          store_id: string
          user_agent: string | null
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          kind: string
          phone_e164?: string | null
          source?: string | null
          store_id: string
          user_agent?: string | null
        }
        Update: {
          accepted?: boolean
          created_at?: string
          customer_id?: string | null
          id?: string
          kind?: string
          phone_e164?: string | null
          source?: string | null
          store_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_consents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_consents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          amount: number
          balance: number
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          expires_at: string | null
          id: string
          notes: string | null
          origin: string
          return_id: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          origin?: string
          return_id?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          origin?: string
          return_id?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "store_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_repeat_events: {
        Row: {
          browser_key: string | null
          created_at: string
          event: string
          id: string
          meta: Json
          popup_kind: string
          store_id: string
        }
        Insert: {
          browser_key?: string | null
          created_at?: string
          event: string
          id?: string
          meta?: Json
          popup_kind: string
          store_id: string
        }
        Update: {
          browser_key?: string | null
          created_at?: string
          event?: string
          id?: string
          meta?: Json
          popup_kind?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_repeat_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_popup_preferences: {
        Row: {
          browser_key: string
          created_at: string
          dismissed_version: number
          dont_show_again: boolean
          id: string
          last_shown_at: string | null
          popup_kind: string
          store_id: string
          updated_at: string
        }
        Insert: {
          browser_key: string
          created_at?: string
          dismissed_version?: number
          dont_show_again?: boolean
          id?: string
          last_shown_at?: string | null
          popup_kind: string
          store_id: string
          updated_at?: string
        }
        Update: {
          browser_key?: string
          created_at?: string
          dismissed_version?: number
          dont_show_again?: boolean
          id?: string
          last_shown_at?: string | null
          popup_kind?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_popup_preferences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string | null
          email_verified_at: string | null
          full_name: string
          marketing_opt_in: boolean
          phone: string | null
          phone_verified_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          email_verified_at?: string | null
          full_name: string
          marketing_opt_in?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          email_verified_at?: string | null
          full_name?: string
          marketing_opt_in?: boolean
          phone?: string | null
          phone_verified_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_record_photos: {
        Row: {
          appointment_id: string | null
          caption: string | null
          created_at: string
          id: string
          image_url: string
          kind: string
          record_id: string
          store_id: string
        }
        Insert: {
          appointment_id?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          image_url: string
          kind?: string
          record_id: string
          store_id: string
        }
        Update: {
          appointment_id?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string
          kind?: string
          record_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_record_photos_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_record_photos_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "customer_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_record_photos_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_records: {
        Row: {
          allergies: string | null
          anamnesis: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          anamnesis?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          anamnesis?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_records_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_subscriptions: {
        Row: {
          amount: number
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delivery_address: Json | null
          delivery_fee: number
          delivery_type: string
          failed_attempts: number
          id: string
          items: Json
          last_charge_at: string | null
          last_error: string | null
          last_order_at: string | null
          next_charge_at: string | null
          next_order_at: string | null
          notes: string | null
          orders_count: number
          paused_at: string | null
          period: string
          product_id: string
          quantity: number
          reactivated_at: string | null
          resumes_at: string | null
          source_order_id: string | null
          started_at: string
          status: string
          store_id: string
          unit_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_fee?: number
          delivery_type?: string
          failed_attempts?: number
          id?: string
          items?: Json
          last_charge_at?: string | null
          last_error?: string | null
          last_order_at?: string | null
          next_charge_at?: string | null
          next_order_at?: string | null
          notes?: string | null
          orders_count?: number
          paused_at?: string | null
          period?: string
          product_id: string
          quantity?: number
          reactivated_at?: string | null
          resumes_at?: string | null
          source_order_id?: string | null
          started_at?: string
          status?: string
          store_id: string
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_fee?: number
          delivery_type?: string
          failed_attempts?: number
          id?: string
          items?: Json
          last_charge_at?: string | null
          last_error?: string | null
          last_order_at?: string | null
          next_charge_at?: string | null
          next_order_at?: string | null
          notes?: string | null
          orders_count?: number
          paused_at?: string | null
          period?: string
          product_id?: string
          quantity?: number
          reactivated_at?: string | null
          resumes_at?: string | null
          source_order_id?: string | null
          started_at?: string
          status?: string
          store_id?: string
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          birth_date: string | null
          created_at: string
          district: string | null
          email: string | null
          id: string
          is_demo: boolean
          marketing_opt_in: boolean
          name: string
          notes: string | null
          phone: string | null
          phone_e164: string | null
          phone_verified_at: string | null
          preferences: Json
          store_id: string
          tags: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          marketing_opt_in?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          phone_e164?: string | null
          phone_verified_at?: string | null
          preferences?: Json
          store_id: string
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          marketing_opt_in?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          phone_e164?: string | null
          phone_verified_at?: string | null
          preferences?: Json
          store_id?: string
          tags?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          created_at: string
          details: Json
          id: string
          kind: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          kind: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          accepted_at: string | null
          attempts: number
          courier_id: string | null
          created_at: string
          customer_note: string | null
          delivered_at: string | null
          delivery_person_id: string | null
          distance_km: number | null
          due_at: string | null
          failure_reason: string | null
          fee: number
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          proof_url: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          courier_id?: string | null
          created_at?: string
          customer_note?: string | null
          delivered_at?: string | null
          delivery_person_id?: string | null
          distance_km?: number | null
          due_at?: string | null
          failure_reason?: string | null
          fee?: number
          id?: string
          notes?: string | null
          order_id: string
          picked_up_at?: string | null
          proof_url?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          courier_id?: string | null
          created_at?: string
          customer_note?: string | null
          delivered_at?: string | null
          delivery_person_id?: string | null
          distance_km?: number | null
          due_at?: string | null
          failure_reason?: string | null
          fee?: number
          id?: string
          notes?: string | null
          order_id?: string
          picked_up_at?: string | null
          proof_url?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_documents: {
        Row: {
          courier_user_id: string
          created_at: string
          file_path: string
          id: string
          kind: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          courier_user_id: string
          created_at?: string
          file_path: string
          id?: string
          kind: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          courier_user_id?: string
          created_at?: string
          file_path?: string
          id?: string
          kind?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_earnings: {
        Row: {
          amount: number
          courier_user_id: string
          created_at: string
          delivery_id: string | null
          id: string
          kind: string
          note: string | null
          status: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          courier_user_id: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          courier_user_id?: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_earnings_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_earnings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_events: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_id: string
          event: string
          id: string
          notes: string | null
          photo_url: string | null
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_id: string
          event: string
          id?: string
          notes?: string | null
          photo_url?: string | null
          store_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_id?: string
          event?: string
          id?: string
          notes?: string | null
          photo_url?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          birth_date: string | null
          city: string | null
          cnh_number: string | null
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string
          is_online: boolean
          phone: string | null
          photo_url: string | null
          pix_key: string | null
          pix_key_type: string | null
          plate: string | null
          region: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["courier_account_status"]
          terms_accepted_at: string | null
          updated_at: string
          user_id: string
          vehicle_brand: string | null
          vehicle_model: string | null
          vehicle_type: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          birth_date?: string | null
          city?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          is_online?: boolean
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          plate?: string | null
          region?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["courier_account_status"]
          terms_accepted_at?: string | null
          updated_at?: string
          user_id: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_type?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          birth_date?: string | null
          city?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          is_online?: boolean
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          plate?: string | null
          region?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["courier_account_status"]
          terms_accepted_at?: string | null
          updated_at?: string
          user_id?: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          vehicle_type?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          created_at: string
          distance_max_km: number | null
          distance_min_km: number
          district: string | null
          eta_minutes: number
          fee: number
          free_above: number | null
          id: string
          is_active: boolean
          label: string
          min_fee: number
          min_order_value: number
          price_per_km: number
          rule_type: string
          sort_order: number
          store_id: string
          updated_at: string
          weight_max_grams: number | null
          zip_end: string | null
          zip_start: string | null
        }
        Insert: {
          created_at?: string
          distance_max_km?: number | null
          distance_min_km?: number
          district?: string | null
          eta_minutes?: number
          fee?: number
          free_above?: number | null
          id?: string
          is_active?: boolean
          label: string
          min_fee?: number
          min_order_value?: number
          price_per_km?: number
          rule_type?: string
          sort_order?: number
          store_id: string
          updated_at?: string
          weight_max_grams?: number | null
          zip_end?: string | null
          zip_start?: string | null
        }
        Update: {
          created_at?: string
          distance_max_km?: number | null
          distance_min_km?: number
          district?: string | null
          eta_minutes?: number
          fee?: number
          free_above?: number | null
          id?: string
          is_active?: boolean
          label?: string
          min_fee?: number
          min_order_value?: number
          price_per_km?: number
          rule_type?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
          weight_max_grams?: number | null
          zip_end?: string | null
          zip_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_deliveries: {
        Row: {
          access_token: string
          created_at: string
          customer_email: string | null
          download_count: number
          expires_at: string | null
          id: string
          last_download_at: string | null
          max_downloads: number
          order_id: string | null
          product_id: string
          released_at: string | null
          revoked_at: string | null
          store_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token?: string
          created_at?: string
          customer_email?: string | null
          download_count?: number
          expires_at?: string | null
          id?: string
          last_download_at?: string | null
          max_downloads?: number
          order_id?: string | null
          product_id: string
          released_at?: string | null
          revoked_at?: string | null
          store_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          customer_email?: string | null
          download_count?: number
          expires_at?: string | null
          id?: string
          last_download_at?: string | null
          max_downloads?: number
          order_id?: string | null
          product_id?: string
          released_at?: string | null
          revoked_at?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_deliveries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_deliveries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_download_events: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          ip: string | null
          store_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          ip?: string | null
          store_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          ip?: string | null
          store_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_download_events_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "digital_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_download_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_areas: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dining_areas_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      dining_tables: {
        Row: {
          area_id: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          pos_x: number
          pos_y: number
          qr_token: string
          seats: number
          shape: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          pos_x?: number
          pos_y?: number
          qr_token?: string
          seats?: number
          shape?: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          pos_x?: number
          pos_y?: number
          qr_token?: string
          seats?: number
          shape?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dining_tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "dining_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dining_tables_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_global_settings: {
        Row: {
          api_key: string | null
          api_key_hint: string | null
          base_url: string | null
          created_at: string
          detected_version: string | null
          environment: string
          events: Json
          id: string
          integration: string
          is_enabled: boolean
          last_check_at: string | null
          last_check_message: string | null
          last_check_ok: boolean | null
          max_retries: number
          retry_delay_ms: number
          singleton: boolean
          timeout_ms: number
          updated_at: string
          webhook_base_url: string | null
          webhook_secret: string | null
          webhook_secret_hint: string | null
        }
        Insert: {
          api_key?: string | null
          api_key_hint?: string | null
          base_url?: string | null
          created_at?: string
          detected_version?: string | null
          environment?: string
          events?: Json
          id?: string
          integration?: string
          is_enabled?: boolean
          last_check_at?: string | null
          last_check_message?: string | null
          last_check_ok?: boolean | null
          max_retries?: number
          retry_delay_ms?: number
          singleton?: boolean
          timeout_ms?: number
          updated_at?: string
          webhook_base_url?: string | null
          webhook_secret?: string | null
          webhook_secret_hint?: string | null
        }
        Update: {
          api_key?: string | null
          api_key_hint?: string | null
          base_url?: string | null
          created_at?: string
          detected_version?: string | null
          environment?: string
          events?: Json
          id?: string
          integration?: string
          is_enabled?: boolean
          last_check_at?: string | null
          last_check_message?: string | null
          last_check_ok?: boolean | null
          max_retries?: number
          retry_delay_ms?: number
          singleton?: boolean
          timeout_ms?: number
          updated_at?: string
          webhook_base_url?: string | null
          webhook_secret?: string | null
          webhook_secret_hint?: string | null
        }
        Relationships: []
      }
      fiscal_invoices: {
        Row: {
          amount: number
          created_at: string
          customer_document: string | null
          customer_name: string | null
          description: string | null
          error_message: string | null
          id: string
          issued_at: string | null
          number: string | null
          order_id: string | null
          pdf_url: string | null
          status: string
          store_id: string
          subscription_id: string | null
          tax_amount: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_document?: string | null
          customer_name?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          issued_at?: string | null
          number?: string | null
          order_id?: string | null
          pdf_url?: string | null
          status?: string
          store_id: string
          subscription_id?: string | null
          tax_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_document?: string | null
          customer_name?: string | null
          description?: string | null
          error_message?: string | null
          id?: string
          issued_at?: string | null
          number?: string | null
          order_id?: string | null
          pdf_url?: string | null
          status?: string
          store_id?: string
          subscription_id?: string | null
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          auto_issue: boolean
          cnpj: string | null
          created_at: string
          default_description: string | null
          municipal_registration: string | null
          provider: string
          service_code: string | null
          store_id: string
          tax_percent: number
          updated_at: string
        }
        Insert: {
          auto_issue?: boolean
          cnpj?: string | null
          created_at?: string
          default_description?: string | null
          municipal_registration?: string | null
          provider?: string
          service_code?: string | null
          store_id: string
          tax_percent?: number
          updated_at?: string
        }
        Update: {
          auto_issue?: boolean
          cnpj?: string | null
          created_at?: string
          default_description?: string | null
          municipal_registration?: string | null
          provider?: string
          service_code?: string | null
          store_id?: string
          tax_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          created_at: string
          id: string
          label: string | null
          latitude: number
          longitude: number
          provider: string
          query_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          latitude: number
          longitude: number
          provider?: string
          query_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          latitude?: number
          longitude?: number
          provider?: string
          query_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      impersonation_sessions: {
        Row: {
          admin_id: string
          consent_reference: string
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          reason: string
          started_at: string
          store_id: string | null
          target_user_id: string | null
        }
        Insert: {
          admin_id: string
          consent_reference: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          reason: string
          started_at?: string
          store_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          admin_id?: string
          consent_reference?: string
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          reason?: string
          started_at?: string
          store_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          created_at: string
          id: string
          min_stock: number
          name: string
          stock_quantity: number
          store_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_stock?: number
          name: string
          stock_quantity?: number
          store_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_stock?: number
          name?: string
          stock_quantity?: number
          store_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          access_token: string | null
          api_key: string | null
          api_secret: string | null
          created_at: string
          expires_at: string | null
          extra: Json
          id: string
          kind: string
          provider: string | null
          refresh_token: string | null
          store_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          access_token?: string | null
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          expires_at?: string | null
          extra?: Json
          id?: string
          kind: string
          provider?: string | null
          refresh_token?: string | null
          store_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          access_token?: string | null
          api_key?: string | null
          api_secret?: string | null
          created_at?: string
          expires_at?: string | null
          extra?: Json
          id?: string
          kind?: string
          provider?: string | null
          refresh_token?: string | null
          store_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          attempts: number
          created_at: string
          direction: string
          error: string | null
          event_type: string | null
          external_id: string | null
          id: string
          kind: string
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          provider: string | null
          status: string
          store_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          kind: string
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string | null
          status?: string
          store_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string | null
          external_id?: string | null
          id?: string
          kind?: string
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          movement_type: string
          product_id: string
          quantity: number
          reason: string | null
          store_id: string
          variant_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: string
          product_id: string
          quantity: number
          reason?: string | null
          store_id: string
          variant_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          store_id?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          id: string
          identifier: string
          ip_address: string | null
          profile_kind: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          identifier: string
          ip_address?: string | null
          profile_kind?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          identifier?: string
          ip_address?: string | null
          profile_kind?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          cashback_balance: number
          cashback_expires_at: string | null
          cashback_expiry_notified_at: string | null
          created_at: string
          customer_id: string
          id: string
          last_order_at: string | null
          orders_count: number
          points_balance: number
          points_earned: number
          points_redeemed: number
          referral_code: string | null
          referral_count: number
          referral_rewarded_at: string | null
          referred_by: string | null
          store_id: string
          tier_id: string | null
          total_spent: number
          updated_at: string
        }
        Insert: {
          cashback_balance?: number
          cashback_expires_at?: string | null
          cashback_expiry_notified_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          last_order_at?: string | null
          orders_count?: number
          points_balance?: number
          points_earned?: number
          points_redeemed?: number
          referral_code?: string | null
          referral_count?: number
          referral_rewarded_at?: string | null
          referred_by?: string | null
          store_id: string
          tier_id?: string | null
          total_spent?: number
          updated_at?: string
        }
        Update: {
          cashback_balance?: number
          cashback_expires_at?: string | null
          cashback_expiry_notified_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          last_order_at?: string | null
          orders_count?: number
          points_balance?: number
          points_earned?: number
          points_redeemed?: number
          referral_code?: string | null
          referral_count?: number
          referral_rewarded_at?: string | null
          referred_by?: string | null
          store_id?: string
          tier_id?: string | null
          total_spent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_mission_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          customer_id: string
          id: string
          mission_id: string
          progress: number
          rewarded: boolean
          store_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          mission_id: string
          progress?: number
          rewarded?: boolean
          store_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          mission_id?: string
          progress?: number
          rewarded?: boolean
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_mission_progress_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "loyalty_missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_mission_progress_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_missions: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          goal_kind: string
          goal_value: number
          id: string
          is_active: boolean
          reward_points: number
          starts_at: string | null
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          goal_kind?: string
          goal_value?: number
          id?: string
          is_active?: boolean
          reward_points?: number
          starts_at?: string | null
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          goal_kind?: string
          goal_value?: number
          id?: string
          is_active?: boolean
          reward_points?: number
          starts_at?: string | null
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_missions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_missions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_redemptions: {
        Row: {
          code: string
          created_at: string
          customer_id: string
          expires_at: string | null
          id: string
          order_id: string | null
          points_spent: number
          reward_id: string | null
          status: string
          store_id: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string
          customer_id: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          points_spent?: number
          reward_id?: string | null
          status?: string
          store_id: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          customer_id?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          points_spent?: number
          reward_id?: string | null
          status?: string
          store_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          channels: string[]
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          kind: string
          min_order_value: number
          name: string
          per_customer_limit: number | null
          points_cost: number
          product_id: string | null
          starts_at: string | null
          stock: number | null
          store_id: string
          updated_at: string
          valid_days: number
        }
        Insert: {
          channels?: string[]
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          kind?: string
          min_order_value?: number
          name: string
          per_customer_limit?: number | null
          points_cost?: number
          product_id?: string | null
          starts_at?: string | null
          stock?: number | null
          store_id: string
          updated_at?: string
          valid_days?: number
        }
        Update: {
          channels?: string[]
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          kind?: string
          min_order_value?: number
          name?: string
          per_customer_limit?: number | null
          points_cost?: number
          product_id?: string | null
          starts_at?: string | null
          stock?: number | null
          store_id?: string
          updated_at?: string
          valid_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rules: {
        Row: {
          category_id: string | null
          channels: string[]
          created_at: string
          description: string | null
          districts: string[]
          ends_at: string | null
          id: string
          is_active: boolean
          kind: string
          min_order_value: number
          multiplier: number
          name: string
          order_types: string[]
          per_customer_limit: number | null
          points: number
          product_ids: string[]
          starts_at: string | null
          store_id: string
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          category_id?: string | null
          channels?: string[]
          created_at?: string
          description?: string | null
          districts?: string[]
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          min_order_value?: number
          multiplier?: number
          name: string
          order_types?: string[]
          per_customer_limit?: number | null
          points?: number
          product_ids?: string[]
          starts_at?: string | null
          store_id: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          category_id?: string | null
          channels?: string[]
          created_at?: string
          description?: string | null
          districts?: string[]
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          min_order_value?: number
          multiplier?: number
          name?: string
          order_types?: string[]
          per_customer_limit?: number | null
          points?: number
          product_ids?: string[]
          starts_at?: string | null
          store_id?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          birthday_bonus_points: number
          cashback_expiration_days: number
          cashback_max_percent_use: number
          cashback_min_order: number
          cashback_percent: number
          created_at: string
          currency_per_point: number
          first_order_points: number
          frequent_bonus_points: number
          frequent_orders_threshold: number
          id: string
          inactive_days: number
          is_enabled: boolean
          min_order_value: number
          points_expiration_days: number
          points_per_currency: number
          referral_cashback_referred: number
          referral_cashback_referrer: number
          referral_enabled: boolean
          referral_points: number
          referred_points: number
          store_id: string
          terms: string | null
          updated_at: string
          winback_points: number
        }
        Insert: {
          birthday_bonus_points?: number
          cashback_expiration_days?: number
          cashback_max_percent_use?: number
          cashback_min_order?: number
          cashback_percent?: number
          created_at?: string
          currency_per_point?: number
          first_order_points?: number
          frequent_bonus_points?: number
          frequent_orders_threshold?: number
          id?: string
          inactive_days?: number
          is_enabled?: boolean
          min_order_value?: number
          points_expiration_days?: number
          points_per_currency?: number
          referral_cashback_referred?: number
          referral_cashback_referrer?: number
          referral_enabled?: boolean
          referral_points?: number
          referred_points?: number
          store_id: string
          terms?: string | null
          updated_at?: string
          winback_points?: number
        }
        Update: {
          birthday_bonus_points?: number
          cashback_expiration_days?: number
          cashback_max_percent_use?: number
          cashback_min_order?: number
          cashback_percent?: number
          created_at?: string
          currency_per_point?: number
          first_order_points?: number
          frequent_bonus_points?: number
          frequent_orders_threshold?: number
          id?: string
          inactive_days?: number
          is_enabled?: boolean
          min_order_value?: number
          points_expiration_days?: number
          points_per_currency?: number
          referral_cashback_referred?: number
          referral_cashback_referrer?: number
          referral_enabled?: boolean
          referral_points?: number
          referred_points?: number
          store_id?: string
          terms?: string | null
          updated_at?: string
          winback_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          benefits: string | null
          color: string
          created_at: string
          discount_percent: number
          id: string
          is_demo: boolean
          min_points: number
          name: string
          points_multiplier: number
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          benefits?: string | null
          color?: string
          created_at?: string
          discount_percent?: number
          id?: string
          is_demo?: boolean
          min_points?: number
          name: string
          points_multiplier?: number
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          benefits?: string | null
          color?: string
          created_at?: string
          discount_percent?: number
          id?: string
          is_demo?: boolean
          min_points?: number
          name?: string
          points_multiplier?: number
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_tiers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          cashback_amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          expires_at: string | null
          id: string
          kind: string
          order_id: string | null
          points: number
          rule_id: string | null
          store_id: string
        }
        Insert: {
          cashback_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          order_id?: string | null
          points?: number
          rule_id?: string | null
          store_id: string
        }
        Update: {
          cashback_amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          order_id?: string | null
          points?: number
          rule_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_profiles: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      message_logs: {
        Row: {
          attempts: number
          channel: string
          contact: string | null
          created_at: string
          direction: string
          error: string | null
          event: string
          id: string
          level: string
          message_id: string | null
          payload: Json
          store_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          contact?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          event: string
          id?: string
          level?: string
          message_id?: string | null
          payload?: Json
          store_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          contact?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          event?: string
          id?: string
          level?: string
          message_id?: string | null
          payload?: Json
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string
          conversation_id: string
          created_at: string
          direction: string
          error: string | null
          external_id: string | null
          id: string
          is_demo: boolean
          media_type: string | null
          media_url: string | null
          sender_id: string | null
          sender_type: string
          status: string
          store_id: string
          template_key: string | null
          transcript: string | null
        }
        Insert: {
          body: string
          channel?: string
          conversation_id: string
          created_at?: string
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          media_type?: string | null
          media_url?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string
          store_id: string
          template_key?: string | null
          transcript?: string | null
        }
        Update: {
          body?: string
          channel?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          is_demo?: boolean
          media_type?: string | null
          media_url?: string | null
          sender_id?: string | null
          sender_type?: string
          status?: string
          store_id?: string
          template_key?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          event: string
          id: string
          order_id: string | null
          payload: Json
          push_sent_at: string | null
          read_at: string | null
          status: string
          store_id: string
          title: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          event: string
          id?: string
          order_id?: string | null
          payload?: Json
          push_sent_at?: string | null
          read_at?: string | null
          status?: string
          store_id: string
          title: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          event?: string
          id?: string
          order_id?: string | null
          payload?: Json
          push_sent_at?: string | null
          read_at?: string | null
          status?: string
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_assignments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          member_name: string
          notes: string | null
          order_id: string
          role: string
          store_id: string
          updated_at: string
          user_id: string | null
          work_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          member_name: string
          notes?: string | null
          order_id: string
          role?: string
          store_id: string
          updated_at?: string
          user_id?: string | null
          work_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          member_name?: string
          notes?: string | null
          order_id?: string
          role?: string
          store_id?: string
          updated_at?: string
          user_id?: string | null
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_assignments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_attachments: {
        Row: {
          created_at: string
          file_path: string
          id: string
          kind: string
          order_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          kind?: string
          order_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          kind?: string
          order_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_attachments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          done_by: string | null
          id: string
          order_id: string
          position: number
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          order_id: string
          position?: number
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          id?: string
          order_id?: string
          position?: number
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_checklist_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_checklist_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          prep_ready_at: string | null
          prep_started_at: string | null
          prep_station: string | null
          prep_status: string
          prescription_info: string | null
          product_id: string | null
          product_name: string
          quantity: number
          store_id: string
          total: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
          weight_kg: number | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          prep_ready_at?: string | null
          prep_started_at?: string | null
          prep_station?: string | null
          prep_status?: string
          prescription_info?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          store_id: string
          total?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
          weight_kg?: number | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          prep_ready_at?: string | null
          prep_started_at?: string | null
          prep_station?: string | null
          prep_status?: string
          prescription_info?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          store_id?: string
          total?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          order_id: string
          previous_status: Database["public"]["Enums"]["order_status"] | null
          reason: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          reason?: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          order_id?: string
          previous_status?: Database["public"]["Enums"]["order_status"] | null
          reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: Json | null
          affiliate_code: string | null
          balance_confirmed_at: string | null
          balance_due: number
          balance_reminder_at: string | null
          cancel_reason: string | null
          cashback_used: number
          channel: string
          code: string
          coupon_code: string | null
          created_at: string
          credits_used: number
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delay_alert_at: string | null
          delivery_fee: number
          delivery_lat: number | null
          delivery_lng: number | null
          delivery_person_id: string | null
          deposit_amount: number
          deposit_paid_at: string | null
          discount: number
          distance_km: number | null
          estimated_at: string | null
          id: string
          is_demo: boolean
          notes: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          prep_ready_at: string | null
          prep_started_at: string | null
          priority: number
          public_token: string
          quote_id: string | null
          referral_code: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          subscription_id: string | null
          subtotal: number
          table_number: string | null
          table_session_id: string | null
          total: number
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
          upsell_items: number
          upsell_total: number
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          address?: Json | null
          affiliate_code?: string | null
          balance_confirmed_at?: string | null
          balance_due?: number
          balance_reminder_at?: string | null
          cancel_reason?: string | null
          cashback_used?: number
          channel?: string
          code?: string
          coupon_code?: string | null
          created_at?: string
          credits_used?: number
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          delay_alert_at?: string | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_person_id?: string | null
          deposit_amount?: number
          deposit_paid_at?: string | null
          discount?: number
          distance_km?: number | null
          estimated_at?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          prep_ready_at?: string | null
          prep_started_at?: string | null
          priority?: number
          public_token?: string
          quote_id?: string | null
          referral_code?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          subscription_id?: string | null
          subtotal?: number
          table_number?: string | null
          table_session_id?: string | null
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          upsell_items?: number
          upsell_total?: number
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          address?: Json | null
          affiliate_code?: string | null
          balance_confirmed_at?: string | null
          balance_due?: number
          balance_reminder_at?: string | null
          cancel_reason?: string | null
          cashback_used?: number
          channel?: string
          code?: string
          coupon_code?: string | null
          created_at?: string
          credits_used?: number
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delay_alert_at?: string | null
          delivery_fee?: number
          delivery_lat?: number | null
          delivery_lng?: number | null
          delivery_person_id?: string | null
          deposit_amount?: number
          deposit_paid_at?: string | null
          discount?: number
          distance_km?: number | null
          estimated_at?: string | null
          id?: string
          is_demo?: boolean
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          prep_ready_at?: string | null
          prep_started_at?: string | null
          priority?: number
          public_token?: string
          quote_id?: string | null
          referral_code?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          subscription_id?: string | null
          subtotal?: number
          table_number?: string | null
          table_session_id?: string | null
          total?: number
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
          upsell_items?: number
          upsell_total?: number
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          card_on_delivery_enabled: boolean
          card_online_enabled: boolean
          cash_enabled: boolean
          created_at: string
          is_sandbox: boolean
          pix_city: string | null
          pix_enabled: boolean
          pix_expires_minutes: number
          pix_holder_name: string | null
          pix_key: string | null
          pix_key_type: string
          provider: string
          public_key: string | null
          store_id: string
          updated_at: string
          webhook_secret_set: boolean
        }
        Insert: {
          card_on_delivery_enabled?: boolean
          card_online_enabled?: boolean
          cash_enabled?: boolean
          created_at?: string
          is_sandbox?: boolean
          pix_city?: string | null
          pix_enabled?: boolean
          pix_expires_minutes?: number
          pix_holder_name?: string | null
          pix_key?: string | null
          pix_key_type?: string
          provider?: string
          public_key?: string | null
          store_id: string
          updated_at?: string
          webhook_secret_set?: boolean
        }
        Update: {
          card_on_delivery_enabled?: boolean
          card_online_enabled?: boolean
          cash_enabled?: boolean
          created_at?: string
          is_sandbox?: boolean
          pix_city?: string | null
          pix_enabled?: boolean
          pix_expires_minutes?: number
          pix_holder_name?: string | null
          pix_key?: string | null
          pix_key_type?: string
          provider?: string
          public_key?: string | null
          store_id?: string
          updated_at?: string
          webhook_secret_set?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string | null
          id: string
          payload: Json
          payment_id: string | null
          processed_at: string | null
          provider: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type?: string | null
          id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          provider: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string | null
          id?: string
          payload?: Json
          payment_id?: string | null
          processed_at?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          expires_at: string | null
          external_id: string | null
          fee_amount: number
          id: string
          idempotency_key: string | null
          is_demo: boolean
          last_error: string | null
          method: string
          net_amount: number | null
          order_id: string | null
          paid_at: string | null
          pix_payload: string | null
          pix_qr_image: string | null
          provider: string
          provider_reference: string | null
          refunded_amount: number
          refunded_at: string | null
          status: Database["public"]["Enums"]["payment_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          last_error?: string | null
          method: string
          net_amount?: number | null
          order_id?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_image?: string | null
          provider?: string
          provider_reference?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          fee_amount?: number
          id?: string
          idempotency_key?: string | null
          is_demo?: boolean
          last_error?: string | null
          method?: string
          net_amount?: number | null
          order_id?: string | null
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_image?: string | null
          provider?: string
          provider_reference?: string | null
          refunded_amount?: number
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json
          highlights: string[]
          id: string
          is_active: boolean
          is_highlighted: boolean
          key: string
          limits: Json
          name: string
          price_month: number
          price_year: number
          sort_order: number
          tagline: string | null
          trial_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json
          highlights?: string[]
          id?: string
          is_active?: boolean
          is_highlighted?: boolean
          key: string
          limits?: Json
          name: string
          price_month?: number
          price_year?: number
          sort_order?: number
          tagline?: string | null
          trial_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json
          highlights?: string[]
          id?: string
          is_active?: boolean
          is_highlighted?: boolean
          key?: string
          limits?: Json
          name?: string
          price_month?: number
          price_year?: number
          sort_order?: number
          tagline?: string | null
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_banners: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
          variant: string
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          starts_at?: string | null
          title: string
          updated_at?: string
          variant?: string
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
          variant?: string
        }
        Relationships: []
      }
      platform_faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_incidents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_incidents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_integrations: {
        Row: {
          config: Json
          created_at: string
          has_secret: boolean
          id: string
          is_enabled: boolean
          kind: string
          label: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          has_secret?: boolean
          id?: string
          is_enabled?: boolean
          kind: string
          label: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          has_secret?: boolean
          id?: string
          is_enabled?: boolean
          kind?: string
          label?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_segments: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          layout: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          layout?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          layout?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_kds_settings: {
        Row: {
          created_at: string
          id: string
          scope: string
          settings: Json
          store_id: string
          terminal: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          scope?: string
          settings?: Json
          store_id: string
          terminal?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          scope?: string
          settings?: Json
          store_id?: string
          terminal?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_kds_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          attempts: number
          content: string
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          printed_at: string | null
          session_id: string | null
          station: string
          status: string
          store_id: string
          template: string
          title: string
        }
        Insert: {
          attempts?: number
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          printed_at?: string | null
          session_id?: string | null
          station?: string
          status?: string
          store_id: string
          template?: string
          title: string
        }
        Update: {
          attempts?: number
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          printed_at?: string | null
          session_id?: string | null
          station?: string
          status?: string
          store_id?: string
          template?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      print_settings: {
        Row: {
          auto_print: boolean
          copies: number
          created_at: string
          footer_text: string | null
          header_text: string | null
          mode: string
          paper_width: string
          printer_name: string | null
          show_customer: boolean
          show_prices: boolean
          stations: string[]
          store_id: string
          updated_at: string
        }
        Insert: {
          auto_print?: boolean
          copies?: number
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          mode?: string
          paper_width?: string
          printer_name?: string | null
          show_customer?: boolean
          show_prices?: boolean
          stations?: string[]
          store_id: string
          updated_at?: string
        }
        Update: {
          auto_print?: boolean
          copies?: number
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          mode?: string
          paper_width?: string
          printer_name?: string | null
          show_customer?: boolean
          show_prices?: boolean
          stations?: string[]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_availability_events: {
        Row: {
          action: string
          automatic: boolean
          created_at: string
          id: string
          min_stock: number | null
          product_id: string
          reason: string | null
          stock_quantity: number | null
          store_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          automatic?: boolean
          created_at?: string
          id?: string
          min_stock?: number | null
          product_id: string
          reason?: string | null
          stock_quantity?: number | null
          store_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          automatic?: boolean
          created_at?: string
          id?: string
          min_stock?: number | null
          product_id?: string
          reason?: string | null
          stock_quantity?: number | null
          store_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_availability_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_availability_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          batch_code: string
          created_at: string
          expires_at: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          store_id: string
          supplier_id: string | null
          unit_cost: number
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          batch_code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity?: number
          store_id: string
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          batch_code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          store_id?: string
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
          store_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          store_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "product_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collection_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collection_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_combo_items: {
        Row: {
          combo_product_id: string
          created_at: string
          deducts_stock: boolean
          id: string
          is_optional: boolean
          item_product_id: string
          quantity: number
          store_id: string
        }
        Insert: {
          combo_product_id: string
          created_at?: string
          deducts_stock?: boolean
          id?: string
          is_optional?: boolean
          item_product_id: string
          quantity?: number
          store_id: string
        }
        Update: {
          combo_product_id?: string
          created_at?: string
          deducts_stock?: boolean
          id?: string
          is_optional?: boolean
          item_product_id?: string
          quantity?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_combo_items_combo_product_id_fkey"
            columns: ["combo_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_item_product_id_fkey"
            columns: ["item_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_combo_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_ingredients: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          product_id: string
          quantity: number
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_id: string
          product_id: string
          quantity?: number
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          product_id?: string
          quantity?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_ingredients_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          created_at: string
          group_type: string
          id: string
          is_required: boolean
          max_select: number
          min_select: number
          name: string
          product_id: string
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_type?: string
          id?: string
          is_required?: boolean
          max_select?: number
          min_select?: number
          name: string
          product_id: string
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_type?: string
          id?: string
          is_required?: boolean
          max_select?: number
          min_select?: number
          name?: string
          product_id?: string
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_groups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          group_id: string
          id: string
          is_available: boolean
          max_quantity: number
          name: string
          price_delta: number
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          is_available?: boolean
          max_quantity?: number
          name: string
          price_delta?: number
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          is_available?: boolean
          max_quantity?: number
          name?: string
          price_delta?: number
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_option_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_professionals: {
        Row: {
          created_at: string
          id: string
          product_id: string
          professional_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          professional_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          professional_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_professionals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_professionals_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_professionals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_related: {
        Row: {
          created_at: string
          id: string
          product_id: string
          related_product_id: string
          sort_order: number
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          related_product_id: string
          sort_order?: number
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          related_product_id?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_related_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_related_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_related_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          avg_cost: number
          barcode: string | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          min_stock: number
          option1_name: string | null
          option1_value: string | null
          option2_name: string | null
          option2_value: string | null
          price: number | null
          product_id: string
          sku: string | null
          sort_order: number
          stock_quantity: number
          store_id: string
          updated_at: string
        }
        Insert: {
          avg_cost?: number
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          option1_name?: string | null
          option1_value?: string | null
          option2_name?: string | null
          option2_value?: string | null
          price?: number | null
          product_id: string
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          avg_cost?: number
          barcode?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          option1_name?: string | null
          option1_value?: string | null
          option2_name?: string | null
          option2_value?: string | null
          price?: number | null
          product_id?: string
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      production_queue: {
        Row: {
          created_at: string
          customer_name: string
          customer_phone: string | null
          desired_at: string
          id: string
          items_count: number
          notes: string | null
          order_id: string | null
          position: number
          reason: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          desired_at: string
          id?: string
          items_count?: number
          notes?: string | null
          order_id?: string | null
          position?: number
          reason?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          desired_at?: string
          id?: string
          items_count?: number
          notes?: string | null
          order_id?: string | null
          position?: number
          reason?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_queue_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      production_settings: {
        Row: {
          created_at: string
          cutoff_days: number
          daily_max_items: number
          daily_max_orders: number
          deposit_percent: number
          id: string
          is_enabled: boolean
          max_days_ahead: number
          max_items_per_slot: number
          max_orders_per_slot: number
          min_lead_minutes: number
          prep_window_minutes: number
          queue_enabled: boolean
          queue_message: string | null
          require_deposit: boolean
          slot_minutes: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cutoff_days?: number
          daily_max_items?: number
          daily_max_orders?: number
          deposit_percent?: number
          id?: string
          is_enabled?: boolean
          max_days_ahead?: number
          max_items_per_slot?: number
          max_orders_per_slot?: number
          min_lead_minutes?: number
          prep_window_minutes?: number
          queue_enabled?: boolean
          queue_message?: string | null
          require_deposit?: boolean
          slot_minutes?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cutoff_days?: number
          daily_max_items?: number
          daily_max_orders?: number
          deposit_percent?: number
          id?: string
          is_enabled?: boolean
          max_days_ahead?: number
          max_items_per_slot?: number
          max_orders_per_slot?: number
          min_lead_minutes?: number
          prep_window_minutes?: number
          queue_enabled?: boolean
          queue_message?: string | null
          require_deposit?: boolean
          slot_minutes?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allows_attachments: boolean
          allows_customization: boolean
          allows_notes: boolean
          archived_at: string | null
          availability_days: number[]
          availability_end: string | null
          availability_start: string | null
          avg_cost: number
          barcode: string | null
          brand: string | null
          buffer_minutes: number
          builder_config: Json
          builder_kind: string | null
          category_id: string | null
          cost_price: number
          created_at: string
          custom_fields: Json
          deposit_percent: number
          description: string | null
          digital_file_path: string | null
          digital_instructions: string | null
          digital_url: string | null
          duration_minutes: number | null
          has_variants: boolean
          id: string
          image_url: string | null
          images: Json
          is_active: boolean
          is_available: boolean
          is_featured: boolean
          is_service: boolean
          kind: Database["public"]["Enums"]["product_kind"]
          lead_time_days: number
          max_quantity_per_order: number | null
          min_stock: number
          name: string
          ncm: string | null
          package_height_cm: number | null
          package_length_cm: number | null
          package_width_cm: number | null
          prep_station: string | null
          price: number
          pricing: Json
          promo_price: number | null
          requires_confirmation: boolean
          requires_customer_approval: boolean
          requires_prescription: boolean
          sku: string | null
          sold_by_weight: boolean
          sort_order: number
          stock_quantity: number
          store_id: string
          subscription_benefits: string[]
          subscription_period: string | null
          tags: string[]
          track_batches: boolean
          track_stock: boolean
          unavailable_reason: string | null
          unit: string
          unit_label: string
          updated_at: string
          warranty_months: number | null
          weight_grams: number | null
        }
        Insert: {
          allows_attachments?: boolean
          allows_customization?: boolean
          allows_notes?: boolean
          archived_at?: string | null
          availability_days?: number[]
          availability_end?: string | null
          availability_start?: string | null
          avg_cost?: number
          barcode?: string | null
          brand?: string | null
          buffer_minutes?: number
          builder_config?: Json
          builder_kind?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          custom_fields?: Json
          deposit_percent?: number
          description?: string | null
          digital_file_path?: string | null
          digital_instructions?: string | null
          digital_url?: string | null
          duration_minutes?: number | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          images?: Json
          is_active?: boolean
          is_available?: boolean
          is_featured?: boolean
          is_service?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          lead_time_days?: number
          max_quantity_per_order?: number | null
          min_stock?: number
          name: string
          ncm?: string | null
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          prep_station?: string | null
          price?: number
          pricing?: Json
          promo_price?: number | null
          requires_confirmation?: boolean
          requires_customer_approval?: boolean
          requires_prescription?: boolean
          sku?: string | null
          sold_by_weight?: boolean
          sort_order?: number
          stock_quantity?: number
          store_id: string
          subscription_benefits?: string[]
          subscription_period?: string | null
          tags?: string[]
          track_batches?: boolean
          track_stock?: boolean
          unavailable_reason?: string | null
          unit?: string
          unit_label?: string
          updated_at?: string
          warranty_months?: number | null
          weight_grams?: number | null
        }
        Update: {
          allows_attachments?: boolean
          allows_customization?: boolean
          allows_notes?: boolean
          archived_at?: string | null
          availability_days?: number[]
          availability_end?: string | null
          availability_start?: string | null
          avg_cost?: number
          barcode?: string | null
          brand?: string | null
          buffer_minutes?: number
          builder_config?: Json
          builder_kind?: string | null
          category_id?: string | null
          cost_price?: number
          created_at?: string
          custom_fields?: Json
          deposit_percent?: number
          description?: string | null
          digital_file_path?: string | null
          digital_instructions?: string | null
          digital_url?: string | null
          duration_minutes?: number | null
          has_variants?: boolean
          id?: string
          image_url?: string | null
          images?: Json
          is_active?: boolean
          is_available?: boolean
          is_featured?: boolean
          is_service?: boolean
          kind?: Database["public"]["Enums"]["product_kind"]
          lead_time_days?: number
          max_quantity_per_order?: number | null
          min_stock?: number
          name?: string
          ncm?: string | null
          package_height_cm?: number | null
          package_length_cm?: number | null
          package_width_cm?: number | null
          prep_station?: string | null
          price?: number
          pricing?: Json
          promo_price?: number | null
          requires_confirmation?: boolean
          requires_customer_approval?: boolean
          requires_prescription?: boolean
          sku?: string | null
          sold_by_weight?: boolean
          sort_order?: number
          stock_quantity?: number
          store_id?: string
          subscription_benefits?: string[]
          subscription_period?: string | null
          tags?: string[]
          track_batches?: boolean
          track_stock?: boolean
          unavailable_reason?: string | null
          unit?: string
          unit_label?: string
          updated_at?: string
          warranty_months?: number | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          avatar_url: string | null
          commission_rate: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role_title: string | null
          store_id: string
          updated_at: string
          user_id: string | null
          working_hours: Json
        }
        Insert: {
          avatar_url?: string | null
          commission_rate?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          role_title?: string | null
          store_id: string
          updated_at?: string
          user_id?: string | null
          working_hours?: Json
        }
        Update: {
          avatar_url?: string | null
          commission_rate?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role_title?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string | null
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "professionals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          campaign: string | null
          code: string
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          min_order_value: number
          starts_at: string | null
          store_id: string
          updated_at: string
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          campaign?: string | null
          code: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          min_order_value?: number
          starts_at?: string | null
          store_id: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          campaign?: string | null
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          min_order_value?: number
          starts_at?: string | null
          store_id?: string
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          audience: string
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          store_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          audience?: string
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          store_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          audience?: string
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          store_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          is_menu_option: boolean
          shortcut: string
          sort_order: number
          store_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_menu_option?: boolean
          shortcut: string
          sort_order?: number
          store_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_menu_option?: boolean
          shortcut?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          customization: Json
          id: string
          name: string
          notes: string | null
          product_id: string | null
          quantity: number
          quote_id: string
          store_id: string
          total: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          customization?: Json
          id?: string
          name: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id: string
          store_id: string
          total?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          customization?: Json
          id?: string
          name?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          quote_id?: string
          store_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approval_reminder_at: string | null
          approved_at: string | null
          code: string
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          delivery_fee: number
          deposit_amount: number
          deposit_percent: number
          discount: number
          event_at: string | null
          id: string
          notes: string | null
          order_id: string | null
          public_token: string
          rejected_at: string | null
          rejection_reason: string | null
          status: string
          store_id: string
          subtotal: number
          total: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approval_reminder_at?: string | null
          approved_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_fee?: number
          deposit_amount?: number
          deposit_percent?: number
          discount?: number
          event_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          public_token?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          store_id: string
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approval_reminder_at?: string | null
          approved_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_fee?: number
          deposit_amount?: number
          deposit_percent?: number
          discount?: number
          event_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          public_token?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          status?: string
          store_id?: string
          subtotal?: number
          total?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          id: string
          identifier: string
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          id?: string
          identifier: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          bucket?: string
          hits?: number
          id?: string
          identifier?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          affiliate_code: string | null
          amount: number
          charge_id: string | null
          commission_reversed: number
          created_at: string
          created_by: string | null
          credit_id: string | null
          customer_name: string | null
          id: string
          invoice_id: string | null
          kind: string
          method: string
          order_id: string | null
          reason: string | null
          revoked_access: boolean
          status: string
          store_id: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_code?: string | null
          amount?: number
          charge_id?: string | null
          commission_reversed?: number
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          method?: string
          order_id?: string | null
          reason?: string | null
          revoked_access?: boolean
          status?: string
          store_id: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_code?: string | null
          amount?: number
          charge_id?: string | null
          commission_reversed?: number
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          method?: string
          order_id?: string | null
          reason?: string | null
          revoked_access?: boolean
          status?: string
          store_id?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "subscription_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "customer_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          district: string | null
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          number: string | null
          reference: string | null
          state: string | null
          street: string
          updated_at: string
          user_id: string
          zip_code: string | null
        }
        Insert: {
          city: string
          complement?: string | null
          created_at?: string
          district?: string | null
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          number?: string | null
          reference?: string | null
          state?: string | null
          street: string
          updated_at?: string
          user_id: string
          zip_code?: string | null
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          district?: string | null
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          number?: string | null
          reference?: string | null
          state?: string | null
          street?: string
          updated_at?: string
          user_id?: string
          zip_code?: string | null
        }
        Relationships: []
      }
      schedule_blocks: {
        Row: {
          created_at: string
          end_time: string | null
          ends_at: string
          id: string
          is_recurring: boolean
          professional_id: string | null
          reason: string | null
          start_time: string | null
          starts_at: string
          store_id: string
          weekday: number | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          ends_at: string
          id?: string
          is_recurring?: boolean
          professional_id?: string | null
          reason?: string | null
          start_time?: string | null
          starts_at: string
          store_id: string
          weekday?: number | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          ends_at?: string
          id?: string
          is_recurring?: boolean
          professional_id?: string | null
          reason?: string | null
          start_time?: string | null
          starts_at?: string
          store_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_settings: {
        Row: {
          allow_reschedule: boolean
          cancellation_hours: number
          cancellation_policy: string | null
          close_time: string
          created_at: string
          deposit_percent: number
          id: string
          max_reschedules: number
          open_time: string
          reminder_24h: boolean
          reminder_2h: boolean
          reminder_template: string | null
          require_deposit: boolean
          reschedule_min_hours: number
          slot_minutes: number
          store_id: string
          updated_at: string
        }
        Insert: {
          allow_reschedule?: boolean
          cancellation_hours?: number
          cancellation_policy?: string | null
          close_time?: string
          created_at?: string
          deposit_percent?: number
          id?: string
          max_reschedules?: number
          open_time?: string
          reminder_24h?: boolean
          reminder_2h?: boolean
          reminder_template?: string | null
          require_deposit?: boolean
          reschedule_min_hours?: number
          slot_minutes?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          allow_reschedule?: boolean
          cancellation_hours?: number
          cancellation_policy?: string | null
          close_time?: string
          created_at?: string
          deposit_percent?: number
          id?: string
          max_reschedules?: number
          open_time?: string
          reminder_24h?: boolean
          reminder_2h?: boolean
          reminder_template?: string | null
          require_deposit?: boolean
          reschedule_min_hours?: number
          slot_minutes?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_entries: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          freight: number
          id: string
          invoice_number: string | null
          issued_at: string
          notes: string | null
          other_costs: number
          status: string
          store_id: string
          supplier_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          freight?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string
          notes?: string | null
          other_costs?: number
          status?: string
          store_id: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          freight?: number
          id?: string
          invoice_number?: string | null
          issued_at?: string
          notes?: string | null
          other_costs?: number
          status?: string
          store_id?: string
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_entry_items: {
        Row: {
          created_at: string
          description: string | null
          entry_id: string
          id: string
          product_id: string | null
          quantity: number
          store_id: string
          total: number
          unit_cost: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          entry_id: string
          id?: string
          product_id?: string | null
          quantity?: number
          store_id: string
          total?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          entry_id?: string
          id?: string
          product_id?: string | null
          quantity?: number
          store_id?: string
          total?: number
          unit_cost?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_entry_items_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "stock_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entry_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entry_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_entry_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_affiliates: {
        Row: {
          code: string
          commission_percent: number
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          code: string
          commission_percent?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          commission_percent?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_affiliates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_checkout_settings: {
        Row: {
          abandoned_cart_coupon_code: string | null
          abandoned_cart_delay_minutes: number
          abandoned_cart_enabled: boolean
          allow_guest: boolean
          allow_phone_lookup: boolean
          allow_public_tracking: boolean
          allow_quick_register: boolean
          allow_repeat_order: boolean
          created_at: string
          history_retention_days: number
          id: string
          notification_channels: Json
          require_email: boolean
          require_full_address: boolean
          require_phone: boolean
          require_verification: boolean
          store_id: string
          tracking_link_days: number
          updated_at: string
          upsell_enabled: boolean
          upsell_max_items: number
        }
        Insert: {
          abandoned_cart_coupon_code?: string | null
          abandoned_cart_delay_minutes?: number
          abandoned_cart_enabled?: boolean
          allow_guest?: boolean
          allow_phone_lookup?: boolean
          allow_public_tracking?: boolean
          allow_quick_register?: boolean
          allow_repeat_order?: boolean
          created_at?: string
          history_retention_days?: number
          id?: string
          notification_channels?: Json
          require_email?: boolean
          require_full_address?: boolean
          require_phone?: boolean
          require_verification?: boolean
          store_id: string
          tracking_link_days?: number
          updated_at?: string
          upsell_enabled?: boolean
          upsell_max_items?: number
        }
        Update: {
          abandoned_cart_coupon_code?: string | null
          abandoned_cart_delay_minutes?: number
          abandoned_cart_enabled?: boolean
          allow_guest?: boolean
          allow_phone_lookup?: boolean
          allow_public_tracking?: boolean
          allow_quick_register?: boolean
          allow_repeat_order?: boolean
          created_at?: string
          history_retention_days?: number
          id?: string
          notification_channels?: Json
          require_email?: boolean
          require_full_address?: boolean
          require_phone?: boolean
          require_verification?: boolean
          store_id?: string
          tracking_link_days?: number
          updated_at?: string
          upsell_enabled?: boolean
          upsell_max_items?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_checkout_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_couriers: {
        Row: {
          blocked_until: string | null
          commission_amount: number
          courier_user_id: string | null
          created_at: string
          id: string
          invite_email: string | null
          invite_phone: string | null
          invite_token: string | null
          priority: number
          region: string | null
          status: Database["public"]["Enums"]["store_courier_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          commission_amount?: number
          courier_user_id?: string | null
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_phone?: string | null
          invite_token?: string | null
          priority?: number
          region?: string | null
          status?: Database["public"]["Enums"]["store_courier_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          commission_amount?: number
          courier_user_id?: string | null
          created_at?: string
          id?: string
          invite_email?: string | null
          invite_phone?: string | null
          invite_token?: string | null
          priority?: number
          region?: string | null
          status?: Database["public"]["Enums"]["store_courier_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_couriers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_entry_popup_settings: {
        Row: {
          created_at: string
          draft_config: Json
          has_unpublished_changes: boolean
          id: string
          popup_kind: string
          published_at: string | null
          published_config: Json | null
          store_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          draft_config?: Json
          has_unpublished_changes?: boolean
          id?: string
          popup_kind: string
          published_at?: string | null
          published_config?: Json | null
          store_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          draft_config?: Json
          has_unpublished_changes?: boolean
          id?: string
          popup_kind?: string
          published_at?: string | null
          published_config?: Json | null
          store_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_entry_popup_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_entry_popup_versions: {
        Row: {
          config: Json
          created_at: string
          id: string
          label: string
          popup_kind: string
          store_id: string
        }
        Insert: {
          config: Json
          created_at?: string
          id?: string
          label?: string
          popup_kind: string
          store_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          label?: string
          popup_kind?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_entry_popup_versions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_features: {
        Row: {
          business_segment: string | null
          created_at: string
          enabled_features: string[]
          id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          business_segment?: string | null
          created_at?: string
          enabled_features?: string[]
          id?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          business_segment?: string | null
          created_at?: string
          enabled_features?: string[]
          id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_features_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_highlight_campaigns: {
        Row: {
          add_button_text: string
          badge: string | null
          category_id: string | null
          created_at: string
          ends_at: string | null
          header_color: string | null
          icon: string | null
          id: string
          is_active: boolean
          layout: string
          max_items: number
          name: string
          selection_rule: string
          show_original_price: boolean
          sort_order: number
          starts_at: string | null
          store_id: string
          subtitle: string
          text_color: string | null
          title: string
          updated_at: string
        }
        Insert: {
          add_button_text?: string
          badge?: string | null
          category_id?: string | null
          created_at?: string
          ends_at?: string | null
          header_color?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          layout?: string
          max_items?: number
          name?: string
          selection_rule?: string
          show_original_price?: boolean
          sort_order?: number
          starts_at?: string | null
          store_id: string
          subtitle?: string
          text_color?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          add_button_text?: string
          badge?: string | null
          category_id?: string | null
          created_at?: string
          ends_at?: string | null
          header_color?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          layout?: string
          max_items?: number
          name?: string
          selection_rule?: string
          show_original_price?: boolean
          sort_order?: number
          starts_at?: string | null
          store_id?: string
          subtitle?: string
          text_color?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_highlight_campaigns_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_highlight_campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_highlight_items: {
        Row: {
          badge: string | null
          campaign_id: string
          created_at: string
          id: string
          product_id: string
          sort_order: number
          store_id: string
        }
        Insert: {
          badge?: string | null
          campaign_id: string
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          store_id: string
        }
        Update: {
          badge?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_highlight_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "store_highlight_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_highlight_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_highlight_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_highlight_products: {
        Row: {
          badge: string | null
          created_at: string
          highlight_id: string
          id: string
          product_id: string
          sort_order: number
          store_id: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          highlight_id: string
          id?: string
          product_id: string
          sort_order?: number
          store_id: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          highlight_id?: string
          id?: string
          product_id?: string
          sort_order?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_highlight_products_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "store_highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_highlight_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_highlight_products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_highlights: {
        Row: {
          auto_open: string
          campaign_ends_at: string | null
          campaign_starts_at: string | null
          category_id: string | null
          created_at: string
          id: string
          is_active: boolean
          max_items: number
          selection_rule: string
          store_id: string
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          auto_open?: string
          campaign_ends_at?: string | null
          campaign_starts_at?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_items?: number
          selection_rule?: string
          store_id: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Update: {
          auto_open?: string
          campaign_ends_at?: string | null
          campaign_starts_at?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_items?: number
          selection_rule?: string
          store_id?: string
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_highlights_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_highlights_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_integrations: {
        Row: {
          config: Json
          created_at: string
          events_count: number
          has_secret: boolean
          id: string
          is_enabled: boolean
          is_sandbox: boolean
          kind: string
          label: string | null
          last_error: string | null
          last_event_at: string | null
          last_event_kind: string | null
          last_test_at: string | null
          last_test_ok: boolean | null
          provider: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          events_count?: number
          has_secret?: boolean
          id?: string
          is_enabled?: boolean
          is_sandbox?: boolean
          kind: string
          label?: string | null
          last_error?: string | null
          last_event_at?: string | null
          last_event_kind?: string | null
          last_test_at?: string | null
          last_test_ok?: boolean | null
          provider?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          events_count?: number
          has_secret?: boolean
          id?: string
          is_enabled?: boolean
          is_sandbox?: boolean
          kind?: string
          label?: string | null
          last_error?: string | null
          last_event_at?: string | null
          last_event_kind?: string | null
          last_test_at?: string | null
          last_test_ok?: boolean | null
          provider?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          permissions: Json
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invite_status"]
          store_id: string
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: Json
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          store_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          permissions?: Json
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invite_status"]
          store_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_invites_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          deactivated_at: string | null
          id: string
          invited_by: string | null
          is_active: boolean
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_reservations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          notified_at: string | null
          order_id: string | null
          picked_up_at: string | null
          pickup_deadline: string | null
          product_id: string | null
          product_name: string
          quantity: number
          status: string
          store_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          order_id?: string | null
          picked_up_at?: string | null
          pickup_deadline?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          status?: string
          store_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          notified_at?: string | null
          order_id?: string | null
          picked_up_at?: string | null
          pickup_deadline?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          status?: string
          store_id?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_reservations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_return_items: {
        Row: {
          created_at: string
          id: string
          product_id: string | null
          product_name: string
          quantity: number
          return_id: string
          store_id: string
          total: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name: string
          quantity?: number
          return_id: string
          store_id: string
          total?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          return_id?: string
          store_id?: string
          total?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "store_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_return_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      store_returns: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          kind: string
          notes: string | null
          order_id: string | null
          reason: string | null
          refund_method: string
          restock: boolean
          status: string
          store_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          kind?: string
          notes?: string | null
          order_id?: string | null
          reason?: string | null
          refund_method?: string
          restock?: boolean
          status?: string
          store_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          kind?: string
          notes?: string | null
          order_id?: string | null
          reason?: string | null
          refund_method?: string
          restock?: boolean
          status?: string
          store_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_reviews: {
        Row: {
          comment: string | null
          created_at: string
          customer_name: string
          id: string
          is_published: boolean
          order_id: string | null
          rating: number
          replied_at: string | null
          reply: string | null
          store_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          is_published?: boolean
          order_id?: string | null
          rating: number
          replied_at?: string | null
          reply?: string | null
          store_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          customer_name?: string
          id?: string
          is_published?: boolean
          order_id?: string | null
          rating?: number
          replied_at?: string | null
          reply?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_sections: {
        Row: {
          accent_color: string | null
          block_key: string
          config: Json
          created_at: string
          id: string
          image_url: string | null
          is_visible: boolean
          schedule_rule: Json
          sort_order: number
          store_id: string
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          block_key: string
          config?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          is_visible?: boolean
          schedule_rule?: Json
          sort_order?: number
          store_id: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          block_key?: string
          config?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          is_visible?: boolean
          schedule_rule?: Json
          sort_order?: number
          store_id?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_sections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_slug_redirects: {
        Row: {
          created_at: string
          id: string
          old_slug: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          old_slug: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          old_slug?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_slug_redirects_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          period: string
          plan_id: string
          provider: string
          status: Database["public"]["Enums"]["subscription_status"]
          store_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          period?: string
          plan_id: string
          provider?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          store_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          period?: string
          plan_id?: string
          provider?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          store_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_theme_versions: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          id: string
          label: string
          sections: Json
          store_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          sections?: Json
          store_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          sections?: Json
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_theme_versions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_themes: {
        Row: {
          created_at: string
          draft_config: Json
          has_unpublished_changes: boolean
          id: string
          preset_key: string
          published_at: string | null
          published_by: string | null
          published_config: Json
          store_id: string
          theme_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          draft_config?: Json
          has_unpublished_changes?: boolean
          id?: string
          preset_key?: string
          published_at?: string | null
          published_by?: string | null
          published_config?: Json
          store_id: string
          theme_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          draft_config?: Json
          has_unpublished_changes?: boolean
          id?: string
          preset_key?: string
          published_at?: string | null
          published_by?: string | null
          published_config?: Json
          store_id?: string
          theme_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_themes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          accepts_delivery: boolean
          accepts_dine_in: boolean
          accepts_pickup: boolean
          accepts_scheduling: boolean
          address_city: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          availability_status: string
          checkout_type: string | null
          cover_url: string | null
          created_at: string
          delivery_areas: Json
          delivery_fee: number
          delivery_mode: string
          description: string | null
          document: string | null
          email: string | null
          holidays: Json
          id: string
          is_active: boolean
          is_demo: boolean
          is_published: boolean
          latitude: number | null
          legal_name: string | null
          logo_url: string | null
          longitude: number | null
          min_order_value: number
          name: string
          onboarding: Json
          opening_hours: Json
          owner_id: string | null
          paused_until: string | null
          payment_methods: Json
          phone: string | null
          plan: string
          segment: string | null
          slug: string
          timezone: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          accepts_delivery?: boolean
          accepts_dine_in?: boolean
          accepts_pickup?: boolean
          accepts_scheduling?: boolean
          address_city?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          availability_status?: string
          checkout_type?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_areas?: Json
          delivery_fee?: number
          delivery_mode?: string
          description?: string | null
          document?: string | null
          email?: string | null
          holidays?: Json
          id?: string
          is_active?: boolean
          is_demo?: boolean
          is_published?: boolean
          latitude?: number | null
          legal_name?: string | null
          logo_url?: string | null
          longitude?: number | null
          min_order_value?: number
          name: string
          onboarding?: Json
          opening_hours?: Json
          owner_id?: string | null
          paused_until?: string | null
          payment_methods?: Json
          phone?: string | null
          plan?: string
          segment?: string | null
          slug: string
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          accepts_delivery?: boolean
          accepts_dine_in?: boolean
          accepts_pickup?: boolean
          accepts_scheduling?: boolean
          address_city?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          availability_status?: string
          checkout_type?: string | null
          cover_url?: string | null
          created_at?: string
          delivery_areas?: Json
          delivery_fee?: number
          delivery_mode?: string
          description?: string | null
          document?: string | null
          email?: string | null
          holidays?: Json
          id?: string
          is_active?: boolean
          is_demo?: boolean
          is_published?: boolean
          latitude?: number | null
          legal_name?: string | null
          logo_url?: string | null
          longitude?: number | null
          min_order_value?: number
          name?: string
          onboarding?: Json
          opening_hours?: Json
          owner_id?: string | null
          paused_until?: string | null
          payment_methods?: Json
          phone?: string | null
          plan?: string
          segment?: string | null
          slug?: string
          timezone?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      subscription_charges: {
        Row: {
          amount: number
          attempt: number
          charged_at: string
          created_at: string
          error_message: string | null
          id: string
          method: string | null
          status: string
          store_id: string
          subscription_id: string
        }
        Insert: {
          amount?: number
          attempt?: number
          charged_at?: string
          created_at?: string
          error_message?: string | null
          id?: string
          method?: string | null
          status?: string
          store_id: string
          subscription_id: string
        }
        Update: {
          amount?: number
          attempt?: number
          charged_at?: string
          created_at?: string
          error_message?: string | null
          id?: string
          method?: string | null
          status?: string
          store_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_charges_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_invoices: {
        Row: {
          amount: number
          created_at: string
          due_at: string | null
          external_id: string | null
          hosted_url: string | null
          id: string
          number: string | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          provider: string
          status: string
          store_id: string
          subscription_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          due_at?: string | null
          external_id?: string | null
          hosted_url?: string | null
          id?: string
          number?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string
          status?: string
          store_id: string
          subscription_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_at?: string | null
          external_id?: string | null
          hosted_url?: string | null
          id?: string
          number?: string | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          provider?: string
          status?: string
          store_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "store_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          created_at: string
          document: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_type?: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          last_message_at: string
          priority: string
          status: Database["public"]["Enums"]["ticket_status"]
          store_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          priority?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          store_id?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_message_at?: string
          priority?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          store_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      table_calls: {
        Row: {
          created_at: string
          id: string
          kind: string
          note: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          status: string
          store_id: string
          table_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          status?: string
          store_id: string
          table_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          status?: string
          store_id?: string
          table_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_calls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_calls_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_calls_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          code: string
          created_at: string
          discount: number
          discount_reason: string | null
          guests: number
          id: string
          label: string | null
          merged_into: string | null
          opened_at: string
          opened_by: string | null
          service_fee_percent: number
          status: string
          store_id: string
          table_id: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          created_at?: string
          discount?: number
          discount_reason?: string | null
          guests?: number
          id?: string
          label?: string | null
          merged_into?: string | null
          opened_at?: string
          opened_by?: string | null
          service_fee_percent?: number
          status?: string
          store_id: string
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          created_at?: string
          discount?: number
          discount_reason?: string | null
          guests?: number
          id?: string
          label?: string | null
          merged_into?: string | null
          opened_at?: string
          opened_by?: string | null
          service_fee_percent?: number
          status?: string
          store_id?: string
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_sessions_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "dining_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          identifier: string
          locked_until: string | null
          purpose: Database["public"]["Enums"]["verification_purpose"]
          user_id: string | null
        }
        Insert: {
          attempts?: number
          channel?: string
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          identifier: string
          locked_until?: string | null
          purpose?: Database["public"]["Enums"]["verification_purpose"]
          user_id?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          identifier?: string
          locked_until?: string | null
          purpose?: Database["public"]["Enums"]["verification_purpose"]
          user_id?: string | null
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          error: string | null
          event: string
          event_id: string
          id: string
          next_retry_at: string | null
          payload: Json
          response_status: number | null
          status: string
          store_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          error?: string | null
          event: string
          event_id?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          response_status?: number | null
          status?: string
          store_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          error?: string | null
          event?: string
          event_id?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          response_status?: number | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          description: string | null
          events: string[]
          failure_count: number
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_status: number | null
          secret: string
          store_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_status?: number | null
          secret: string
          store_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_status?: number | null
          secret?: string
          store_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_automation_rules: {
        Row: {
          audience: string
          category: string
          conditions: Json
          created_at: string
          id: string
          is_active: boolean
          last_run_at: string | null
          max_per_day: number
          message_body: string
          name: string
          order_type: string | null
          run_count: number
          send_from: string | null
          send_to: string | null
          store_id: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          audience?: string
          category?: string
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          max_per_day?: number
          message_body: string
          name: string
          order_type?: string | null
          run_count?: number
          send_from?: string | null
          send_to?: string | null
          store_id: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          audience?: string
          category?: string
          conditions?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          max_per_day?: number
          message_body?: string
          name?: string
          order_type?: string | null
          run_count?: number
          send_from?: string | null
          send_to?: string | null
          store_id?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automation_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connection_events: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          instance_id: string | null
          previous_status: string | null
          status: string
          store_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          instance_id?: string | null
          previous_status?: string | null
          status: string
          store_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          instance_id?: string | null
          previous_status?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connection_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_connection_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_customer_preferences: {
        Row: {
          accept_delivery: boolean
          accept_marketing: boolean
          accept_orders: boolean
          accept_support: boolean
          created_at: string
          id: string
          opted_out_at: string | null
          phone: string
          source: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          accept_delivery?: boolean
          accept_marketing?: boolean
          accept_orders?: boolean
          accept_support?: boolean
          created_at?: string
          id?: string
          opted_out_at?: string | null
          phone: string
          source?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          accept_delivery?: boolean
          accept_marketing?: boolean
          accept_orders?: boolean
          accept_support?: boolean
          created_at?: string
          id?: string
          opted_out_at?: string | null
          phone?: string
          source?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_customer_preferences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_delivery_attempts: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          id: string
          message_log_id: string | null
          next_retry_at: string | null
          status: string
          store_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          id?: string
          message_log_id?: string | null
          next_retry_at?: string | null
          status: string
          store_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          id?: string
          message_log_id?: string | null
          next_retry_at?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_delivery_attempts_message_log_id_fkey"
            columns: ["message_log_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_message_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_delivery_attempts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_credentials: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          store_id: string
          token: string | null
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          store_id: string
          token?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          store_id?: string
          token?: string | null
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_credentials_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instance_credentials_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          connected_at: string | null
          created_at: string
          disconnected_at: string | null
          external_instance_id: string | null
          id: string
          instance_key: string
          instance_name: string
          last_error: string | null
          last_event_at: string | null
          last_sync_at: string | null
          owner_user_id: string | null
          phone_number: string | null
          profile_name: string | null
          qr_expires_at: string | null
          settings: Json
          status: string
          store_id: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          external_instance_id?: string | null
          id?: string
          instance_key?: string
          instance_name: string
          last_error?: string | null
          last_event_at?: string | null
          last_sync_at?: string | null
          owner_user_id?: string | null
          phone_number?: string | null
          profile_name?: string | null
          qr_expires_at?: string | null
          settings?: Json
          status?: string
          store_id: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          disconnected_at?: string | null
          external_instance_id?: string | null
          id?: string
          instance_key?: string
          instance_name?: string
          last_error?: string | null
          last_event_at?: string | null
          last_sync_at?: string | null
          owner_user_id?: string | null
          phone_number?: string | null
          profile_name?: string | null
          qr_expires_at?: string | null
          settings?: Json
          status?: string
          store_id?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_logs: {
        Row: {
          automation_id: string | null
          body_preview: string | null
          created_at: string
          customer_id: string | null
          error: string | null
          id: string
          instance_id: string | null
          message_type: string
          order_id: string | null
          phone_hash: string | null
          phone_masked: string | null
          provider_response: Json
          status: string
          store_id: string
          template_key: string | null
        }
        Insert: {
          automation_id?: string | null
          body_preview?: string | null
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          instance_id?: string | null
          message_type?: string
          order_id?: string | null
          phone_hash?: string | null
          phone_masked?: string | null
          provider_response?: Json
          status?: string
          store_id: string
          template_key?: string | null
        }
        Update: {
          automation_id?: string | null
          body_preview?: string | null
          created_at?: string
          customer_id?: string | null
          error?: string | null
          id?: string
          instance_id?: string | null
          message_type?: string
          order_id?: string | null
          phone_hash?: string | null
          phone_masked?: string | null
          provider_response?: Json
          status?: string
          store_id?: string
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_message_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          error: string | null
          event_type: string
          id: string
          instance_id: string | null
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          status: string
          store_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          error?: string | null
          event_type: string
          id?: string
          instance_id?: string | null
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          store_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          error?: string | null
          event_type?: string
          id?: string
          instance_id?: string | null
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_webhook_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_stock_entry: { Args: { _entry_id: string }; Returns: Json }
      cash_session_summary: { Args: { _session_id: string }; Returns: Json }
      claim_cron_run: {
        Args: { _min_interval_seconds?: number; _name: string }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: {
          _bucket: string
          _identifier: string
          _limit: number
          _window_seconds: number
        }
        Returns: Json
      }
      enqueue_appointment_reminders: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_store_permission: {
        Args: { _area: string; _store_id: string; _user_id: string }
        Returns: boolean
      }
      has_store_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _store_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_customer_blocked: {
        Args: { _phone: string; _store_id: string }
        Returns: boolean
      }
      is_reserved_slug: { Args: { _slug: string }; Returns: boolean }
      is_slug_available: {
        Args: { _slug: string; _store_id?: string }
        Returns: boolean
      }
      is_store_member: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_staff: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      low_stock_alerts: {
        Args: { _store_id: string }
        Returns: {
          id: string
          kind: string
          min_stock: number
          name: string
          stock: number
          unit: string
        }[]
      }
      my_account_kinds: { Args: never; Returns: Json }
      store_plan_limits: { Args: { _store_id: string }; Returns: Json }
      store_rating_summary: { Args: { _store_id: string }; Returns: Json }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "owner"
        | "manager"
        | "staff"
        | "delivery_person"
        | "customer"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "done"
        | "cancelled"
        | "no_show"
      courier_account_status:
        | "draft"
        | "awaiting_verification"
        | "awaiting_approval"
        | "approved"
        | "active"
        | "offline"
        | "on_delivery"
        | "suspended"
        | "rejected"
        | "disabled"
      delivery_status: "assigned" | "picked_up" | "delivered" | "failed"
      invite_status: "pending" | "accepted" | "revoked" | "expired"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
        | "awaiting_payment"
        | "paid"
        | "picked_up"
        | "completed"
        | "rejected"
      order_type: "delivery" | "pickup" | "dine_in" | "scheduled" | "counter"
      payment_status: "pending" | "paid" | "refunded" | "failed"
      product_kind:
        | "product"
        | "service"
        | "preorder"
        | "subscription"
        | "digital"
        | "combo"
      store_courier_status:
        | "invited"
        | "pending"
        | "approved"
        | "blocked"
        | "removed"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
      ticket_status: "open" | "pending" | "resolved" | "closed"
      verification_purpose:
        | "signup"
        | "login"
        | "phone"
        | "email"
        | "password_reset"
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
      app_role: [
        "super_admin",
        "owner",
        "manager",
        "staff",
        "delivery_person",
        "customer",
      ],
      appointment_status: [
        "scheduled",
        "confirmed",
        "done",
        "cancelled",
        "no_show",
      ],
      courier_account_status: [
        "draft",
        "awaiting_verification",
        "awaiting_approval",
        "approved",
        "active",
        "offline",
        "on_delivery",
        "suspended",
        "rejected",
        "disabled",
      ],
      delivery_status: ["assigned", "picked_up", "delivered", "failed"],
      invite_status: ["pending", "accepted", "revoked", "expired"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "awaiting_payment",
        "paid",
        "picked_up",
        "completed",
        "rejected",
      ],
      order_type: ["delivery", "pickup", "dine_in", "scheduled", "counter"],
      payment_status: ["pending", "paid", "refunded", "failed"],
      product_kind: [
        "product",
        "service",
        "preorder",
        "subscription",
        "digital",
        "combo",
      ],
      store_courier_status: [
        "invited",
        "pending",
        "approved",
        "blocked",
        "removed",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
      ],
      ticket_status: ["open", "pending", "resolved", "closed"],
      verification_purpose: [
        "signup",
        "login",
        "phone",
        "email",
        "password_reset",
      ],
    },
  },
} as const
