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
          image_url: string | null;
          tags: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
          source_url: string | null;
          offered_item_ids: string[] | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          category: string;
          condition: string;
          image_url?: string | null;
          tags?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          source_url?: string | null;
          offered_item_ids?: string[] | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          condition?: string;
          image_url?: string | null;
          tags?: string[];
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          source_url?: string | null;
          offered_item_ids?: string[] | null;
        };
      };
      matches: {
        Row: {
          id: string;
          item_id_1: string;
          item_id_2: string;
          user_id_1: string;
          user_id_2: string;
          status: 'pending' | 'accepted' | 'rejected';
          created_at: string;
          updated_at: string;
          user_id_1_offered_item_ids: string[] | null;
          user_id_2_offered_item_ids: string[] | null;
        };
        Insert: {
          id?: string;
          item_id_1: string;
          item_id_2: string;
          user_id_1: string;
          user_id_2: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
          updated_at?: string;
          user_id_1_offered_item_ids?: string[] | null;
          user_id_2_offered_item_ids?: string[] | null;
        };
        Update: {
          id?: string;
          item_id_1?: string;
          item_id_2?: string;
          user_id_1?: string;
          user_id_2?: string;
          status?: 'pending' | 'accepted' | 'rejected';
          created_at?: string;
          updated_at?: string;
          user_id_1_offered_item_ids?: string[] | null;
          user_id_2_offered_item_ids?: string[] | null;
        };
      };
    };
  };
}

export type User = Database['public']['Tables']['users']['Row'];
export type Item = Database['public']['Tables']['items']['Row'];
export type Match = Database['public']['Tables']['matches']['Row'];