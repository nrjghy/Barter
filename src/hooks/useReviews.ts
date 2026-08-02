import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ReviewService } from "../services";

export const useReviews = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get user reviews (reviews received by the user)
  const {
    data: reviewsData,
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery({
    queryKey: ["reviews", user?.id],
    queryFn: () => ReviewService.getUserReviews(user!.id),
    enabled: !!user,
  });

  // Get reviews written by user
  const {
    data: reviewsByUserData,
    isLoading: reviewsByUserLoading,
    error: reviewsByUserError,
  } = useQuery({
    queryKey: ["reviewsByUser", user?.id],
    queryFn: () => ReviewService.getReviewsByUser(user!.id),
    enabled: !!user,
  });

  // Get review statistics
  const {
    data: reviewStatsData,
    isLoading: reviewStatsLoading,
    error: reviewStatsError,
  } = useQuery({
    queryKey: ["reviewStats", user?.id],
    queryFn: () => ReviewService.getUserReviewStats(user!.id),
    enabled: !!user,
  });

  // Create review mutation
  const createReview = useMutation({
    mutationFn: ({ reviewData }: { reviewData: any }) => ReviewService.createReview(reviewData, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["reviews", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["reviewsByUser", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["reviewStats", user?.id] });
    },
  });

  // Check if user can review a trade completion
  const canReviewTrade = async (tradeCompletionId: string) => {
    if (!user) return false;
    const result = await ReviewService.canReviewTrade(tradeCompletionId, user.id);
    return result.data || false;
  };

  return {
    // Reviews received by user
    reviews: reviewsData?.data || [],
    reviewsLoading,
    reviewsError: reviewsError?.message,

    // Reviews written by user
    reviewsByUser: reviewsByUserData?.data || [],
    reviewsByUserLoading,
    reviewsByUserError: reviewsByUserError?.message,

    // Review statistics
    reviewStats: reviewStatsData?.data,
    reviewStatsLoading,
    reviewStatsError: reviewStatsError?.message,

    // Actions
    createReview: createReview.mutate,
    createReviewLoading: createReview.isPending,
    createReviewError: createReview.error?.message,
    canReviewTrade,
  };
};
