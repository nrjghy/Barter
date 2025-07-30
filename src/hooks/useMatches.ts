import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Match, Item } from "../types/database";
import { useAuth } from "../contexts/AuthContext";

export interface MatchWithItems extends Match {
  item1: {
    id: string;
    title: string;
    image_url: string | null;
  };
  item2: {
    id: string;
    title: string;
    image_url: string | null;
  };
  user1: {
    username: string;
    avatar_url: string | null;
  };
  user2: {
    username: string;
    avatar_url: string | null;
    id: string;
  };
}

export const useMatches = () => {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchMatches();
    }
  }, [user]);

  const fetchMatches = async () => {
    if (!user) return;

    console.log("Fetching matches for user:", user.id);

    try {
      const { data, error } = await supabase
        .from("matches")
        .select(
          `
          *,
          item1:item_id_1 (
            id,
            title,
            image_url
          ),
          item2:item_id_2 (
            id,
            title,
            image_url
          ),
          user1:user_id_1 (
            id,
            username,
            avatar_url
          ),
          user2:user_id_2 (
            id,
            username,
            avatar_url
          )
        `
        )
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      console.log("Raw matches fetched:", data?.length || 0, data);

      // No need to fetch offered items details anymore - simplified to one-to-one matching
      console.log("Final matches:", data.length);
      setMatches(data as MatchWithItems[]);
    } catch (error) {
      console.error("Error fetching matches:", error);
    } finally {
      setLoading(false);
    }
  };

  const createMatch = async (itemId1: string, itemId2: string, userId1: string, userId2: string) => {
    const { data, error } = await supabase
      .from("matches")
      .insert([
        {
          item_id_1: itemId1,
          item_id_2: itemId2,
          user_id_1: userId1,
          user_id_2: userId2,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (!error) {
      await fetchMatches();
    }

    return { data, error };
  };

  const updateMatch = async (matchId: string, status: "accepted" | "rejected") => {
    const { data, error } = await supabase
      .from("matches")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", matchId)
      .select()
      .single();

    if (!error) {
      await fetchMatches();
    }

    return { data, error };
  };

  return {
    matches,
    loading,
    createMatch,
    updateMatch,
    refetch: fetchMatches,
  };
};
