import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { UserBlock } from "../types/database";
import { ValidationService } from "../services/validation";

export interface UserBlockWithUser extends UserBlock {
  blocked_user: {
    username: string;
    avatar_url: string | null;
  };
}

const fetchBlockedUsers = async (userId: string) => {
  const { data, error } = await supabase
    .from("user_blocks")
    .select(
      `
      *,
      blocked_user:users!user_blocks_blocked_id_fkey(username, avatar_url)
    `
    )
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as UserBlockWithUser[];
};

const blockUserFn = async ({ userId, blockedId, reason }: { userId: string; blockedId: string; reason?: string }) => {
  const { data, error } = await supabase
    .from("user_blocks")
    .insert([
      {
        blocker_id: userId,
        blocked_id: blockedId,
        reason,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

const unblockUserFn = async ({ userId, blockedId }: { userId: string; blockedId: string }) => {
  const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedId);
  if (error) throw error;
  return blockedId;
};

const isUserBlockedFn = async (userId: string, blockedId: string): Promise<boolean> => {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId)
    .single();
  return !error && !!data;
};

const getBlockedUserIdsFn = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId);
  if (error) throw error;
  return data.map((block: any) => block.blocked_id);
};

const isBlockedEitherWayFn = async (userId: string, otherUserId: string): Promise<boolean> => {
  // otherUserId comes straight from a route param -- validate its shape
  // before it's interpolated into the .or() filter string below, rather
  // than passing an arbitrary string into PostgREST's filter syntax.
  if (ValidationService.validateUUID(otherUserId)) {
    return false;
  }

  const { data, error } = await supabase
    .from("user_blocks")
    .select("id")
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
};

/**
 * Whether a block exists between the current user and `otherUserId`, in
 * either direction. Used to give a blocked relationship the same silent
 * "nothing here" treatment everywhere else in the app already gives it
 * (e.g. Chat never tells the blocked party they've been blocked) rather
 * than a distinct "you're blocked" message.
 */
export const useIsBlockedEitherWay = (otherUserId?: string) => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["isBlockedEitherWay", user?.id, otherUserId],
    queryFn: () => isBlockedEitherWayFn(user!.id, otherUserId!),
    enabled: !!user && !!otherUserId,
  });

  return {
    isBlocked: data ?? false,
    loading: isLoading,
  };
};

export const useUserBlocks = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: blockedUsers = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["blockedUsers", user?.id],
    queryFn: () => fetchBlockedUsers(user!.id),
    enabled: !!user,
  });

  const blockUser = useMutation({
    mutationFn: ({ blockedId, reason }: { blockedId: string; reason?: string }) =>
      blockUserFn({ userId: user!.id, blockedId, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockedUsers", user?.id] });
    },
  });

  const unblockUser = useMutation({
    mutationFn: ({ blockedId }: { blockedId: string }) => unblockUserFn({ userId: user!.id, blockedId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blockedUsers", user?.id] });
    },
  });

  // Check if a user is blocked
  const isUserBlocked = (blockedId: string) => isUserBlockedFn(user!.id, blockedId);

  // Get all blocked user IDs
  const getBlockedUserIds = () => getBlockedUserIdsFn(user!.id);

  return {
    loading,
    blockedUsers,
    error,
    blockUser: ({ blockedId, reason }: { blockedId: string; reason?: string }) =>
      blockUser.mutateAsync({ blockedId, reason }),
    unblockUser: ({ blockedId }: { blockedId: string }) => unblockUser.mutateAsync({ blockedId }),
    isUserBlocked,
    getBlockedUserIds,
    refetch,
  };
};
