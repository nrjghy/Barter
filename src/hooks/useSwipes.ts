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
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "left" | "right" }) =>
      SwipeService.recordSwipe({ userId: user!.id, itemId, direction }),
    onSuccess: (result, variables) => {
      if (result.data) {
        // Update swiped items cache surgically
        queryClient.setQueryData(["swipedItems", user?.id], (oldData: any) => {
          if (oldData?.data) {
            return {
              ...oldData,
              data: [...oldData.data, variables.itemId]
            };
          }
          return { data: [variables.itemId] };
        });

        // Re-fetch swipe limit data since the RPC response no longer includes it
        queryClient.invalidateQueries({ queryKey: ["swipeLimit", user?.id] });

        // Only invalidate matches if this was a right swipe that might create matches
        if (variables.direction === "right" && result.data.matchCheckNeeded) {
          // Invalidate matches after a short delay to allow background match creation
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["matches", user?.id] });
          }, 1000);
        }
      }
    },
    onError: (error, variables) => {
      // On error, we might need to revert optimistic updates
      // This is handled in the Dashboard component now
      console.error("Swipe recording failed:", error);
    },
  });

  return {
    loading: recordSwipe.isPending || swipedItemsLoading || swipeLimitLoading,
    dailySwipeCount: swipeLimitData?.data?.dailySwipeCount ?? 0,
    swipeLimit: 50, // From APP_CONFIG
    recordSwipe: ({ itemId, direction }: { itemId: string; direction: "left" | "right" }) =>
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
