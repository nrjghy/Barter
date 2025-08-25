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
          wishlist_categories: string[];
          notification_preferences: any;
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
          wishlist_categories?: string[];
          notification_preferences?: any;
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
          wishlist_categories?: string[];
          notification_preferences?: any;
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
          created_at: string;
          updated_at: string;
          estimated_value: number | null;
          value_currency: string;
          source_url: string | null;
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
          created_at?: string;
          updated_at?: string;
          estimated_value?: number | null;
          value_currency: string;
          source_url?: string | null;
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
          created_at?: string;
          updated_at?: string;
          estimated_value?: number | null;
          value_currency?: string;
          source_url?: string | null;
        };
      };
      swipes: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          direction: "left" | "right" | "super";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          direction: "left" | "right" | "super";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          direction?: "left" | "right" | "super";
          created_at?: string;
        };
      };
      matches: {
        Row: {
          id: string;
          item_id_1: string;
          item_id_2: string;
          user_id_1: string;
          user_id_2: string;
          status: "pending" | "accepted" | "rejected";
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          completed_by: string | null;
          is_super_like: boolean;
        };
        Insert: {
          id?: string;
          item_id_1: string;
          item_id_2: string;
          user_id_1: string;
          user_id_2: string;
          status?: "pending" | "accepted" | "rejected";
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          is_super_like?: boolean;
        };
        Update: {
          id?: string;
          item_id_1?: string;
          item_id_2?: string;
          user_id_1?: string;
          user_id_2?: string;
          status?: "pending" | "accepted" | "rejected";
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          is_super_like?: boolean;
        };
      };
      reviews: {
        Row: {
          id: string;
          match_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          trade_experience: "excellent" | "good" | "fair" | "poor" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment?: string | null;
          trade_experience?: "excellent" | "good" | "fair" | "poor" | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          match_id?: string;
          reviewer_id?: string;
          reviewee_id?: string;
          rating?: number;
          comment?: string | null;
          trade_experience?: "excellent" | "good" | "fair" | "poor" | null;
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
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: "match" | "message" | "trade_completed" | "review" | "system";
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
          type: "match" | "message" | "trade_completed" | "review" | "system";
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
          type?: "match" | "message" | "trade_completed" | "review" | "system";
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
export type Match = Database["public"]["Tables"]["matches"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type UserBlock = Database["public"]["Tables"]["user_blocks"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
