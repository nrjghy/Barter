import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ResponseService } from "../services";

export const useResponses = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get like limit data
  const { data: likeLimitData, isLoading: likeLimitLoading } = useQuery({
    queryKey: ["likeLimit", user?.id],
    queryFn: () => ResponseService.checkLikeLimit(user!.id),
    enabled: !!user,
  });

  // Get responded items
  const {
    data: respondedItemsData,
    isLoading: respondedItemsLoading,
    refetch: refetchRespondedItems,
  } = useQuery({
    queryKey: ["respondedItems", user?.id],
    queryFn: () => ResponseService.getRespondedItems(user!.id),
    enabled: !!user,
  });

  // Undo mutation -- real server-side reversal via undo_response, not just
  // local state (see ResponseService.undoResponse for why the old client-only
  // Undo was never actually reversing anything).
  const undoResponse = useMutation({
    mutationFn: ({ itemId }: { itemId: string }) => ResponseService.undoResponse(user!.id, itemId),
    onSuccess: (result, variables) => {
      if (result.data) {
        // Inverse of recordResponse's cache update: remove rather than add.
        queryClient.setQueryData(["respondedItems", user?.id], (oldData: any) => {
          if (oldData?.data) {
            return {
              ...oldData,
              data: oldData.data.filter((id: string) => id !== variables.itemId),
            };
          }
          return oldData;
        });

        // The daily like counter may have been given back -- re-fetch rather
        // than guess the new value client-side.
        queryClient.invalidateQueries({ queryKey: ["likeLimit", user?.id] });
      }
    },
    onError: (error) => {
      console.error("Undo failed:", error);
    },
  });

  // Record response mutation
  const recordResponse = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "pass" | "like" }) =>
      ResponseService.recordResponse({ userId: user!.id, itemId, direction }),
    onSuccess: (result, variables) => {
      if (result.data) {
        // Update responded items cache surgically
        queryClient.setQueryData(["respondedItems", user?.id], (oldData: any) => {
          if (oldData?.data) {
            return {
              ...oldData,
              data: [...oldData.data, variables.itemId]
            };
          }
          return { data: [variables.itemId] };
        });

        // Re-fetch like limit data since the RPC response no longer includes it
        queryClient.invalidateQueries({ queryKey: ["likeLimit", user?.id] });

        // Only invalidate connections if this was a like that might create one
        if (
          variables.direction === "like" &&
          (result.data.matchCheckNeeded || result.data.giveawayConnectionNeeded || result.data.curatorConnectionNeeded)
        ) {
          // Invalidate connections after a short delay to allow background match/connection creation
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["connections", user?.id] });
          }, 1000);
        }
      }
    },
    onError: (error, variables) => {
      // On error, we might need to revert optimistic updates
      // This is handled in the Discover component now
      console.error("Response recording failed:", error);
    },
  });

  return {
    loading: recordResponse.isPending || respondedItemsLoading || likeLimitLoading,
    dailyLikeCount: likeLimitData?.data?.dailySwipeCount ?? 0,
    likeLimit: likeLimitData?.data?.limit ?? 300,
    recordResponse: ({ itemId, direction }: { itemId: string; direction: "pass" | "like" }) =>
      recordResponse.mutateAsync({ itemId, direction }),
    undoResponse: (itemId: string) => undoResponse.mutateAsync({ itemId }),
    undoResponseLoading: undoResponse.isPending,
    checkLikeLimit: () => ResponseService.checkLikeLimit(user!.id),
    getRespondedItems: () => refetchRespondedItems().then((res) => res.data?.data ?? []),
  };
};
