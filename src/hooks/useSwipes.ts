import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { SwipeService } from "../services";

export const useSwipes = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get swipe limit data
  const { data: swipeLimitData, isLoading: swipeLimitLoading } = useQuery({
    queryKey: ["swipeLimit", user?.id],
    queryFn: () => SwipeService.checkSwipeLimit(user!.id),
    enabled: !!user,
  });

  // Get swiped items
  const {
    data: swipedItemsData,
    isLoading: swipedItemsLoading,
    refetch: refetchSwipedItems,
  } = useQuery({
    queryKey: ["swipedItems", user?.id],
    queryFn: () => SwipeService.getSwipedItems(user!.id),
    enabled: !!user,
  });

  // Record swipe mutation
  const recordSwipe = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "left" | "right" | "super" }) =>
      SwipeService.recordSwipe({ userId: user!.id, itemId, direction }),
    onSuccess: (result) => {
      if (result.data) {
        // Invalidate related queries
        queryClient.invalidateQueries({ queryKey: ["swipedItems", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["swipeLimit", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
      }
    },
  });

  return {
    loading: recordSwipe.isPending || swipedItemsLoading || swipeLimitLoading,
    dailySwipeCount: swipeLimitData?.data?.dailySwipeCount ?? 0,
    swipeLimit: 50, // From APP_CONFIG
    recordSwipe: ({ itemId, direction }: { itemId: string; direction: "left" | "right" | "super" }) =>
      recordSwipe.mutateAsync({ itemId, direction }),
    checkSwipeLimit: () => SwipeService.checkSwipeLimit(user!.id),
    getSwipedItems: () => refetchSwipedItems().then((res) => res.data?.data ?? []),
    // Debug function to test match creation
    testMatchCreation: async (itemId: string) => {
      if (!user) return;
      console.log("Testing match creation for item:", itemId);
      await SwipeService.checkForMatch(user.id, itemId, false);
    },
  };
};
