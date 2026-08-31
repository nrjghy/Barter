export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          location: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          role: string;
          rating: number | null;
          total_ratings: number | null;
          rating_sum: number | null;
          browse_mode: "public" | "groups";
          browse_group_ids: string[];
        };
        Insert: {
          id: string;
          username: string;
          location?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          role?: string;
          rating?: number | null;
          total_ratings?: number | null;
          rating_sum?: number | null;
          browse_mode?: "public" | "groups";
          browse_group_ids?: string[];
        };
        Update: {
          id?: string;
          username?: string;
          location?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          role?: string;
          rating?: number | null;
          total_ratings?: number | null;
          rating_sum?: number | null;
          browse_mode?: "public" | "groups";
          browse_group_ids?: string[];
        };
      };
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          creator_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          creator_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          creator_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      group_memberships: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          role: "creator" | "member";
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id: string;
          role?: "creator" | "member";
          joined_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          user_id?: string;
          role?: "creator" | "member";
          joined_at?: string;
        };
      };
      item_groups: {
        Row: {
          id: string;
          item_id: string;
          group_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          group_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          group_id?: string;
          created_at?: string;
        };
      };
      items: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          category: string;
          condition: string;
          image_urls: string[]; // ✅ Changed from single image_url to array of image_urls
          tags: string[];
          is_active: boolean;
          status: "active" | "cancelled" | "traded" | "expired";
          listing_type: string;
          created_at: string;
          updated_at: string;
          estimated_value: number | null;
          value_currency: string;
          source_url: string | null;
          is_public: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          category: string;
          condition: string;
          image_urls?: string[]; // ✅ Changed from single image_url to array of image_urls
          tags?: string[];
          is_active?: boolean;
          status?: "active" | "cancelled" | "traded" | "expired";
          listing_type?: string;
          created_at?: string;
          updated_at?: string;
          estimated_value?: number | null;
          value_currency: string;
          source_url?: string | null;
          is_public?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          condition?: string;
          image_urls?: string[]; // ✅ Changed from single image_url to array of image_urls
          tags?: string[];
          is_active?: boolean;
          status?: "active" | "cancelled" | "traded" | "expired";
          listing_type?: string;
          created_at?: string;
          updated_at?: string;
          estimated_value?: number | null;
          value_currency?: string;
          source_url?: string | null;
          is_public?: boolean;
        };
      };
      connections: {
        Row: {
          id: string;
          user_id_1: string;
          user_id_2: string;
          status: "active" | "ended";
          ended_at: string | null;
          ended_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id_1: string;
          user_id_2: string;
          status?: "active" | "ended";
          ended_at?: string | null;
          ended_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id_1?: string;
          user_id_2?: string;
          status?: "active" | "ended";
          ended_at?: string | null;
          ended_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      connection_item_interests: {
        Row: {
          id: string;
          connection_id: string;
          item_id_1: string | null;
          item_id_2: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          connection_id: string;
          item_id_1?: string | null;
          item_id_2: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          connection_id?: string;
          item_id_1?: string | null;
          item_id_2?: string;
          created_at?: string;
        };
      };
      connection_reads: {
        Row: {
          connection_id: string;
          user_id: string;
          last_opened_at: string;
        };
        Insert: {
          connection_id: string;
          user_id: string;
          last_opened_at?: string;
        };
        Update: {
          connection_id?: string;
          user_id?: string;
          last_opened_at?: string;
        };
      };
      trade_completions: {
        Row: {
          id: string;
          connection_id: string;
          completed_by: string;
          completed_at: string;
          dispute_deadline: string;
          disputed_at: string | null;
          disputed_by: string | null;
          review_reminder_sent_at: string | null;
          dispute_reason: string | null;
          status: "completed" | "pending_approval" | "approved" | "superseded";
          approved_at: string | null;
          approved_by: string | null;
        };
        Insert: {
          id?: string;
          connection_id: string;
          completed_by: string;
          completed_at?: string;
          dispute_deadline: string;
          disputed_at?: string | null;
          disputed_by?: string | null;
          review_reminder_sent_at?: string | null;
          dispute_reason?: string | null;
          status?: "completed" | "pending_approval" | "approved" | "superseded";
          approved_at?: string | null;
          approved_by?: string | null;
        };
        Update: {
          id?: string;
          connection_id?: string;
          completed_by?: string;
          completed_at?: string;
          dispute_deadline?: string;
          disputed_at?: string | null;
          disputed_by?: string | null;
          review_reminder_sent_at?: string | null;
          dispute_reason?: string | null;
          status?: "completed" | "pending_approval" | "approved" | "superseded";
          approved_at?: string | null;
          approved_by?: string | null;
        };
      };
      trade_completion_items: {
        Row: {
          id: string;
          trade_completion_id: string;
          item_id: string;
        };
        Insert: {
          id?: string;
          trade_completion_id: string;
          item_id: string;
        };
        Update: {
          id?: string;
          trade_completion_id?: string;
          item_id?: string;
        };
      };
      offers: {
        Row: {
          id: string;
          connection_id: string;
          proposed_by: string;
          status: "pending" | "agreed" | "superseded" | "withdrawn" | "expired" | "completed";
          expires_at: string;
          agreed_at: string | null;
          auto_complete_at: string | null;
          trade_completion_id: string | null;
          superseded_by: string | null;
          reminder_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          connection_id: string;
          proposed_by: string;
          status?: "pending" | "agreed" | "superseded" | "withdrawn" | "expired" | "completed";
          expires_at: string;
          agreed_at?: string | null;
          auto_complete_at?: string | null;
          trade_completion_id?: string | null;
          superseded_by?: string | null;
          reminder_sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          connection_id?: string;
          proposed_by?: string;
          status?: "pending" | "agreed" | "superseded" | "withdrawn" | "expired" | "completed";
          expires_at?: string;
          agreed_at?: string | null;
          auto_complete_at?: string | null;
          trade_completion_id?: string | null;
          superseded_by?: string | null;
          reminder_sent_at?: string | null;
          created_at?: string;
        };
      };
      offer_items: {
        Row: {
          id: string;
          offer_id: string;
          item_id: string;
          offered_by: string;
        };
        Insert: {
          id?: string;
          offer_id: string;
          item_id: string;
          offered_by: string;
        };
        Update: {
          id?: string;
          offer_id?: string;
          item_id?: string;
          offered_by?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          connection_id: string;
          sender_id: string;
          content: string;
          message_type: "text" | "photo" | "location" | "system";
          data: Record<string, unknown> | null;
          is_read: boolean;
          created_at: string;
          updated_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          connection_id: string;
          sender_id: string;
          content: string;
          message_type?: "text" | "photo" | "location" | "system";
          data?: Record<string, unknown> | null;
          is_read?: boolean;
          created_at?: string;
          updated_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          connection_id?: string;
          sender_id?: string;
          content?: string;
          message_type?: "text" | "photo" | "location" | "system";
          data?: Record<string, unknown> | null;
          is_read?: boolean;
          created_at?: string;
          updated_at?: string;
          read_at?: string | null;
        };
      };
      reviews: {
        Row: {
          id: string;
          trade_completion_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trade_completion_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trade_completion_id?: string;
          reviewer_id?: string;
          reviewee_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_blocks: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          blocker_id?: string;
          blocked_id?: string;
          reason?: string | null;
          created_at?: string;
        };
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_item_id: string | null;
          reported_user_id: string;
          reason: string;
          description: string | null;
          status: string;
          admin_notes: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_item_id?: string | null;
          reported_user_id: string;
          reason: string;
          description?: string | null;
          status?: string;
          admin_notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          reported_item_id?: string | null;
          reported_user_id?: string;
          reason?: string;
          description?: string | null;
          status?: string;
          admin_notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      app_settings: {
        Row: {
          key: string;
          value: unknown;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: unknown;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: unknown;
          updated_at?: string;
        };
      };
      issues: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string;
          issue_type: "bug" | "feature_request" | "general" | "other";
          status: "open" | "in_progress" | "resolved" | "closed" | null;
          priority: "low" | "medium" | "high" | "urgent" | null;
          image_urls: string[] | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description: string;
          issue_type: "bug" | "feature_request" | "general" | "other";
          status?: "open" | "in_progress" | "resolved" | "closed" | null;
          priority?: "low" | "medium" | "high" | "urgent" | null;
          image_urls?: string[] | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string;
          issue_type?: "bug" | "feature_request" | "general" | "other";
          status?: "open" | "in_progress" | "resolved" | "closed" | null;
          priority?: "low" | "medium" | "high" | "urgent" | null;
          image_urls?: string[] | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: "match" | "message" | "trade_completed" | "review" | "system" | "item_unavailable" | "review_reminder" | "issue_status" | "admin_daily_summary" | "trade_dispute" | "listing_expiry_reminder" | "pending_approval" | "group_invite" | "group_invite_accepted" | "group_invite_declined" | "group_ownership_transferred";
          title: string;
          content: string;
          data: any;
          is_read: boolean;
          created_at: string;
          expires_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: "match" | "message" | "trade_completed" | "review" | "system" | "item_unavailable" | "review_reminder" | "issue_status" | "admin_daily_summary" | "trade_dispute" | "listing_expiry_reminder" | "pending_approval" | "group_invite" | "group_invite_accepted" | "group_invite_declined" | "group_ownership_transferred";
          title: string;
          content: string;
          data?: any;
          is_read?: boolean;
          created_at?: string;
          expires_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: "match" | "message" | "trade_completed" | "review" | "system" | "item_unavailable" | "review_reminder" | "issue_status" | "admin_daily_summary" | "trade_dispute" | "listing_expiry_reminder" | "pending_approval";
          title?: string;
          content?: string;
          data?: any;
          is_read?: boolean;
          created_at?: string;
          expires_at?: string | null;
        };
      };
    };
  };
}

export type User = Database["public"]["Tables"]["users"]["Row"];
export type Item = Database["public"]["Tables"]["items"]["Row"];
export type Connection = Database["public"]["Tables"]["connections"]["Row"];
export type ConnectionItemInterest = Database["public"]["Tables"]["connection_item_interests"]["Row"];
export type ConnectionRead = Database["public"]["Tables"]["connection_reads"]["Row"];
export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
export type TradeCompletion = Database["public"]["Tables"]["trade_completions"]["Row"];
export type TradeCompletionItem = Database["public"]["Tables"]["trade_completion_items"]["Row"];
export type Offer = Database["public"]["Tables"]["offers"]["Row"];
export type OfferItem = Database["public"]["Tables"]["offer_items"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type UserBlock = Database["public"]["Tables"]["user_blocks"]["Row"];
export type Report = Database["public"]["Tables"]["reports"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type Issue = Database["public"]["Tables"]["issues"]["Row"];
export type Group = Database["public"]["Tables"]["groups"]["Row"];
export type GroupMembership = Database["public"]["Tables"]["group_memberships"]["Row"];
export type ItemGroup = Database["public"]["Tables"]["item_groups"]["Row"];
