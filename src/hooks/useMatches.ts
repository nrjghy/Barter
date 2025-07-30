import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Match } from "../types/database";
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

const fetchMatches = async (userId: string): Promise<MatchWithItems[]> => {
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
    .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as MatchWithItems[];
};

const createMatchFn = async ({
  itemId1,
  itemId2,
  userId1,
  userId2,
}: {
  itemId1: string;
  itemId2: string;
  userId1: string;
  userId2: string;
}) => {
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
  if (error) throw error;
  return data;
};

const updateMatchFn = async ({ matchId, status }: { matchId: string; status: "accepted" | "rejected" }) => {
  const { data, error } = await supabase
    .from("matches")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", matchId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const useMatches = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: matches = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["matches", user?.id],
    queryFn: () => fetchMatches(user!.id),
    enabled: !!user,
  });

  const createMatch = useMutation({
    mutationFn: createMatchFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
    },
  });

  const updateMatch = useMutation({
    mutationFn: updateMatchFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
    },
  });

  return {
    matches,
    loading,
    error,
    createMatch: createMatch.mutateAsync,
    updateMatch: updateMatch.mutateAsync,
    refetch,
  };
};
