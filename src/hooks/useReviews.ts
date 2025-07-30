import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { Review } from "../types/database";

export interface ReviewWithUsers extends Review {
  reviewer: {
    username: string;
    avatar_url: string | null;
  };
  reviewee: {
    username: string;
    avatar_url: string | null;
  };
  match: {
    item1: { title: string };
    item2: { title: string };
  };
}

export interface CreateReviewData {
  match_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
  trade_experience?: "excellent" | "good" | "fair" | "poor";
}

const fetchUserReviews = async (revieweeId: string) => {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      `
      *,
      reviewer:users!reviews_reviewer_id_fkey(username, avatar_url),
      reviewee:users!reviews_reviewee_id_fkey(username, avatar_url),
      match:matches(
        item1:items!matches_item_id_1_fkey(title),
        item2:items!matches_item_id_2_fkey(title)
      )
    `
    )
    .eq("reviewee_id", revieweeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as ReviewWithUsers[];
};

const createReviewFn = async ({
  reviewData,
  reviewerId,
  reviewerUsername,
}: {
  reviewData: CreateReviewData;
  reviewerId: string;
  reviewerUsername: string;
}) => {
  const { data, error } = await supabase
    .from("reviews")
    .insert([
      {
        ...reviewData,
        reviewer_id: reviewerId,
      },
    ])
    .select()
    .single();
  if (error) throw error;

  // Create notification for the reviewee
  await supabase.rpc("create_notification", {
    p_user_id: reviewData.reviewee_id,
    p_type: "review",
    p_title: "New Review Received",
    p_content: `${reviewerUsername} left you a ${reviewData.rating}-star review`,
    p_data: { review_id: data.id, rating: reviewData.rating },
  });

  return data;
};

export const useReviews = (revieweeIdOverride?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const revieweeId = revieweeIdOverride || user?.id;

  const {
    data: reviews = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["reviews", revieweeId],
    queryFn: () => fetchUserReviews(revieweeId!),
    enabled: !!revieweeId,
  });

  const createReview = useMutation({
    mutationFn: ({ reviewData }: { reviewData: CreateReviewData }) =>
      createReviewFn({ reviewData, reviewerId: user!.id, reviewerUsername: user!.username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", revieweeId] });
    },
  });

  // Check if the user can review a match
  const checkCanReview = async (matchId: string, revieweeId: string) => {
    if (!user) return false;
    try {
      // Check if user already reviewed this match
      const { data: existingReview } = await supabase
        .from("reviews")
        .select("id")
        .eq("match_id", matchId)
        .eq("reviewer_id", user.id)
        .single();
      if (existingReview) return false;
      // Check if match is accepted and user is part of it
      const { data: match } = await supabase
        .from("matches")
        .select("status, user_id_1, user_id_2")
        .eq("id", matchId)
        .single();
      return match && match.status === "accepted" && (match.user_id_1 === user.id || match.user_id_2 === user.id);
    } catch (error) {
      console.error("Error checking review eligibility:", error);
      return false;
    }
  };

  return {
    loading,
    reviews,
    error,
    createReview: (reviewData: CreateReviewData) => createReview.mutateAsync({ reviewData }),
    refetch,
    checkCanReview,
  };
};
