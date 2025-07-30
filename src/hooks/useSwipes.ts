import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import toast from "react-hot-toast";

export interface SwipeData {
  user_id: string;
  item_id: string;
  direction: "left" | "right" | "super";
}

const checkSwipeLimitFn = async (userId: string): Promise<{ canSwipe: boolean; dailySwipeCount: number }> => {
  const { data, error } = await supabase.rpc("can_user_swipe", { user_uuid: userId });
  if (error) throw error;
  // Get current swipe count
  const { data: userData } = await supabase.from("users").select("daily_swipes").eq("id", userId).single();
  return { canSwipe: data, dailySwipeCount: userData?.daily_swipes ?? 0 };
};

const recordSwipeFn = async ({
  userId,
  itemId,
  direction,
}: {
  userId: string;
  itemId: string;
  direction: "left" | "right" | "super";
}) => {
  // Check if user can swipe
  const { canSwipe } = await checkSwipeLimitFn(userId);
  if (!canSwipe) {
    throw new Error("Daily swipe limit reached");
  }
  // Record the swipe
  const { error: swipeError } = await supabase.from("swipes").insert([
    {
      user_id: userId,
      item_id: itemId,
      direction,
    },
  ]);
  if (swipeError && !swipeError.message.includes("duplicate")) {
    throw swipeError;
  }
  // Increment swipe count
  await supabase.rpc("increment_swipe_count", { user_uuid: userId });
  // If it's a right swipe or super like, check for matches
  if (direction === "right" || direction === "super") {
    await checkForMatch(userId, itemId, direction === "super");
  }
  return true;
};

const checkForMatch = async (userId: string, itemId: string, isSuperLike: boolean = false) => {
  // Get the item details
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("user_id, title")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return;
  // Get current user's items
  const { data: userItems } = await supabase.from("items").select("id").eq("user_id", userId).eq("is_active", true);
  if (!userItems || userItems.length === 0) return;
  const userItemIds = userItems.map((item: any) => item.id);
  // Check if other user swiped right on any of our items
  const { data: mutualSwipes } = await supabase
    .from("swipes")
    .select("item_id")
    .eq("user_id", item.user_id)
    .in("item_id", userItemIds)
    .in("direction", ["right", "super"]);
  if (mutualSwipes && mutualSwipes.length > 0) {
    const otherUserSwipe = mutualSwipes[0];
    // Create a match!
    const { error: matchError } = await supabase.from("matches").insert([
      {
        item_id_1: otherUserSwipe.item_id,
        item_id_2: itemId,
        user_id_1: userId,
        user_id_2: item.user_id,
        is_super_like: isSuperLike,
        status: "pending",
      },
    ]);
    if (!matchError) {
      toast.success(`🎉 It's a match! You both liked each other's items!`);
    }
  }
};

const getSwipedItemsFn = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase.from("swipes").select("item_id").eq("user_id", userId);
  if (error) throw error;
  return data.map((swipe: any) => swipe.item_id);
};

export const useSwipes = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const swipeLimit = 50;

  // Get swiped items
  const {
    data: swipedItems = [],
    isLoading: swipedItemsLoading,
    error: swipedItemsError,
    refetch: refetchSwipedItems,
  } = useQuery({
    queryKey: ["swipedItems", user?.id],
    queryFn: () => getSwipedItemsFn(user!.id),
    enabled: !!user,
  });

  // Check swipe limit
  const checkSwipeLimit = useMutation({
    mutationFn: () => checkSwipeLimitFn(user!.id),
  });

  // Record swipe
  const recordSwipe = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "left" | "right" | "super" }) =>
      recordSwipeFn({ userId: user!.id, itemId, direction }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swipedItems", user?.id] });
    },
  });

  // Get daily swipe count
  const { data: swipeLimitData, isLoading: swipeLimitLoading } = useQuery({
    queryKey: ["swipeLimit", user?.id],
    queryFn: () => checkSwipeLimitFn(user!.id),
    enabled: !!user,
  });

  return {
    loading: recordSwipe.isLoading || swipedItemsLoading || swipeLimitLoading,
    dailySwipeCount: swipeLimitData?.dailySwipeCount ?? 0,
    swipeLimit,
    recordSwipe: ({ itemId, direction }: { itemId: string; direction: "left" | "right" | "super" }) =>
      recordSwipe.mutateAsync({ itemId, direction }),
    checkSwipeLimit: () => checkSwipeLimit.mutateAsync(),
    getSwipedItems: () => refetchSwipedItems().then((res) => res.data ?? []),
  };
};
