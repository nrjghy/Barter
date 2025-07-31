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
  // Record the swipe (swipe limit is already checked by the UI before calling this)
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
  try {
    console.log(`Checking for match: userId=${userId}, itemId=${itemId}, isSuperLike=${isSuperLike}`);

    // Get the item details
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("user_id, title")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      console.error("Error getting item details:", itemError);
      return;
    }

    console.log(`Item belongs to user: ${item.user_id}, title: ${item.title}`);

    // Get current user's items
    const { data: userItems, error: userItemsError } = await supabase
      .from("items")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (userItemsError) {
      console.error("Error getting user items:", userItemsError);
      return;
    }

    if (!userItems || userItems.length === 0) {
      console.log("User has no active items, cannot create match");
      return;
    }

    const userItemIds = userItems.map((item: any) => item.id);
    console.log(`User's active items: ${userItemIds.join(", ")}`);

    // Check if other user swiped right on any of our items
    const { data: mutualSwipes, error: swipesError } = await supabase
      .from("swipes")
      .select("item_id")
      .eq("user_id", item.user_id)
      .in("item_id", userItemIds)
      .in("direction", ["right", "super"]);

    if (swipesError) {
      console.error("Error checking mutual swipes:", swipesError);
      return;
    }

    console.log(`Found ${mutualSwipes?.length || 0} mutual swipes`);

    if (mutualSwipes && mutualSwipes.length > 0) {
      const otherUserSwipe = mutualSwipes[0];
      console.log(`Creating match with item_id_1=${otherUserSwipe.item_id}, item_id_2=${itemId}`);

      // Check if match already exists to avoid unique constraint violation
      const { data: existingMatches, error: checkError } = await supabase
        .from("matches")
        .select("id")
        .or(
          `and(item_id_1.eq.${otherUserSwipe.item_id},item_id_2.eq.${itemId}),and(item_id_1.eq.${itemId},item_id_2.eq.${otherUserSwipe.item_id})`
        );

      if (checkError) {
        console.error("Error checking existing match:", checkError);
        return;
      }

      if (existingMatches && existingMatches.length > 0) {
        console.log("Match already exists, skipping creation");
        return;
      }

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

      if (matchError) {
        console.error("Error creating match:", matchError);
        if (matchError.message.includes("duplicate")) {
          console.log("Match already exists (caught by constraint)");
        } else {
          toast.error("Failed to create match");
        }
      } else {
        console.log("Match created successfully!");
        toast.success(`🎉 It's a match! You both liked each other's items!`);
      }
    } else {
      console.log("No mutual swipes found, no match created");
    }
  } catch (error) {
    console.error("Unexpected error in checkForMatch:", error);
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

  // Record swipe
  const recordSwipe = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "left" | "right" | "super" }) =>
      recordSwipeFn({ userId: user!.id, itemId, direction }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swipedItems", user?.id] });
      // Only invalidate swipe limit when a swipe is actually recorded
      queryClient.invalidateQueries({ queryKey: ["swipeLimit", user?.id] });
      // Invalidate matches when a swipe is recorded (in case it creates a match)
      queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
    },
  });

  // Get daily swipe count
  const { data: swipeLimitData, isLoading: swipeLimitLoading } = useQuery({
    queryKey: ["swipeLimit", user?.id],
    queryFn: () => checkSwipeLimitFn(user!.id),
    enabled: !!user,
  });

  return {
    loading: recordSwipe.isPending || swipedItemsLoading || swipeLimitLoading,
    dailySwipeCount: swipeLimitData?.dailySwipeCount ?? 0,
    swipeLimit,
    recordSwipe: ({ itemId, direction }: { itemId: string; direction: "left" | "right" | "super" }) =>
      recordSwipe.mutateAsync({ itemId, direction }),
    checkSwipeLimit: () => checkSwipeLimitFn(user!.id),
    getSwipedItems: () => refetchSwipedItems().then((res) => res.data ?? []),
    // Debug function to test match creation
    testMatchCreation: async (itemId: string) => {
      if (!user) return;
      console.log("Testing match creation for item:", itemId);
      await checkForMatch(user.id, itemId, false);
    },
  };
};
