import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError, ReviewData } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES, BUSINESS_RULES } from "./config";
import { ValidationService } from "./validation";

export interface ReviewWithDetails {
  id: string;
  matchId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  tradeExperience: "excellent" | "good" | "fair" | "poor";
  createdAt: string;
  updatedAt: string;
  reviewer: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  reviewee: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  match: {
    id: string;
    itemId1: string;
    itemId2: string;
    status: string;
  };
}

export interface CreateReviewData {
  matchId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  tradeExperience: "excellent" | "good" | "fair" | "poor";
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  tradeExperienceDistribution: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  };
}

export class ReviewService {
  /**
   * Create a new review
   */
  static async createReview(
    reviewData: CreateReviewData,
    reviewerId: string
  ): Promise<ServiceResult<ReviewWithDetails>> {
    try {
      // Validate input
      const validationError = this.validateReviewData(reviewData);
      if (validationError) {
        return { error: validationError };
      }

      const reviewerIdError = ValidationService.validateUUID(reviewerId);
      if (reviewerIdError) {
        return { error: reviewerIdError };
      }

      // Check if user has already reviewed this match
      const existingReview = await this.getReviewByMatchAndUser(reviewData.matchId, reviewerId);
      if (existingReview.data) {
        return {
          error: {
            code: ERROR_CODES.DUPLICATE_REVIEW,
            message: ERROR_MESSAGES[ERROR_CODES.DUPLICATE_REVIEW],
          },
        };
      }

      // Verify the match exists and user is part of it
      const matchResult = await this.verifyMatchAccess(reviewData.matchId, reviewerId, reviewData.revieweeId);
      if (matchResult.error) {
        return { error: matchResult.error };
      }

      // Create the review
      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .insert([
          {
            match_id: reviewData.matchId,
            reviewer_id: reviewerId,
            reviewee_id: reviewData.revieweeId,
            rating: reviewData.rating,
            comment: reviewData.comment,
            trade_experience: reviewData.tradeExperience,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to create review",
            details: error,
          },
        };
      }

      // Get the full review details
      const fullReview = await this.getReview(data.id);
      if (fullReview.error) {
        return { error: fullReview.error };
      }

      // Update user rating
      await this.updateUserRating(reviewData.revieweeId);

      return { data: fullReview.data! };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get all reviews for a user
   */
  static async getUserReviews(userId: string): Promise<ServiceResult<ReviewWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .select(
          `
          *,
          reviewer:users!reviewer_id (
            id,
            username,
            avatar_url
          ),
          reviewee:users!reviewee_id (
            id,
            username,
            avatar_url
          ),
          match:matches!match_id (
            id,
            item_id_1,
            item_id_2,
            status
          )
        `
        )
        .eq("reviewee_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user reviews",
            details: error,
          },
        };
      }

      const transformedData: ReviewWithDetails[] = data.map((review: any) => ({
        id: review.id,
        matchId: review.match_id,
        reviewerId: review.reviewer_id,
        revieweeId: review.reviewee_id,
        rating: review.rating,
        comment: review.comment,
        tradeExperience: review.trade_experience,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
        reviewer: {
          id: review.reviewer.id,
          username: review.reviewer.username,
          avatarUrl: review.reviewer.avatar_url,
        },
        reviewee: {
          id: review.reviewee.id,
          username: review.reviewee.username,
          avatarUrl: review.reviewee.avatar_url,
        },
        match: {
          id: review.match.id,
          itemId1: review.match.item_id_1,
          itemId2: review.match.item_id_2,
          status: review.match.status,
        },
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get reviews written by a user
   */
  static async getReviewsByUser(userId: string): Promise<ServiceResult<ReviewWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .select(
          `
          *,
          reviewer:users!reviewer_id (
            id,
            username,
            avatar_url
          ),
          reviewee:users!reviewee_id (
            id,
            username,
            avatar_url
          ),
          match:matches!match_id (
            id,
            item_id_1,
            item_id_2,
            status
          )
        `
        )
        .eq("reviewer_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch reviews by user",
            details: error,
          },
        };
      }

      const transformedData: ReviewWithDetails[] = data.map((review: any) => ({
        id: review.id,
        matchId: review.match_id,
        reviewerId: review.reviewer_id,
        revieweeId: review.reviewee_id,
        rating: review.rating,
        comment: review.comment,
        tradeExperience: review.trade_experience,
        createdAt: review.created_at,
        updatedAt: review.updated_at,
        reviewer: {
          id: review.reviewer.id,
          username: review.reviewer.username,
          avatarUrl: review.reviewer.avatar_url,
        },
        reviewee: {
          id: review.reviewee.id,
          username: review.reviewee.username,
          avatarUrl: review.reviewee.avatar_url,
        },
        match: {
          id: review.match.id,
          itemId1: review.match.item_id_1,
          itemId2: review.match.item_id_2,
          status: review.match.status,
        },
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get a single review by ID
   */
  static async getReview(reviewId: string): Promise<ServiceResult<ReviewWithDetails>> {
    try {
      const uuidError = ValidationService.validateUUID(reviewId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .select(
          `
          *,
          reviewer:users!reviewer_id (
            id,
            username,
            avatar_url
          ),
          reviewee:users!reviewee_id (
            id,
            username,
            avatar_url
          ),
          match:matches!match_id (
            id,
            item_id_1,
            item_id_2,
            status
          )
        `
        )
        .eq("id", reviewId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.ITEM_NOT_FOUND,
              message: "Review not found",
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch review",
            details: error,
          },
        };
      }

      const transformedData: ReviewWithDetails = {
        id: data.id,
        matchId: data.match_id,
        reviewerId: data.reviewer_id,
        revieweeId: data.reviewee_id,
        rating: data.rating,
        comment: data.comment,
        tradeExperience: data.trade_experience,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        reviewer: {
          id: data.reviewer.id,
          username: data.reviewer.username,
          avatarUrl: data.reviewer.avatar_url,
        },
        reviewee: {
          id: data.reviewee.id,
          username: data.reviewee.username,
          avatarUrl: data.reviewee.avatar_url,
        },
        match: {
          id: data.match.id,
          itemId1: data.match.item_id_1,
          itemId2: data.match.item_id_2,
          status: data.match.status,
        },
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get review statistics for a user
   */
  static async getUserReviewStats(userId: string): Promise<ServiceResult<ReviewStats>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .select("rating, trade_experience")
        .eq("reviewee_id", userId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch review statistics",
            details: error,
          },
        };
      }

      const totalReviews = data.length;
      const averageRating = totalReviews > 0 ? data.reduce((sum, review) => sum + review.rating, 0) / totalReviews : 0;

      const ratingDistribution = {
        1: data.filter((review) => review.rating === 1).length,
        2: data.filter((review) => review.rating === 2).length,
        3: data.filter((review) => review.rating === 3).length,
        4: data.filter((review) => review.rating === 4).length,
        5: data.filter((review) => review.rating === 5).length,
      };

      const tradeExperienceDistribution = {
        excellent: data.filter((review) => review.trade_experience === "excellent").length,
        good: data.filter((review) => review.trade_experience === "good").length,
        fair: data.filter((review) => review.trade_experience === "fair").length,
        poor: data.filter((review) => review.trade_experience === "poor").length,
      };

      return {
        data: {
          totalReviews,
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
          ratingDistribution,
          tradeExperienceDistribution,
        },
      };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Check if user can review a match
   */
  static async canReviewMatch(matchId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const matchIdError = ValidationService.validateUUID(matchId);
      const userIdError = ValidationService.validateUUID(userId);
      if (matchIdError) return { error: matchIdError };
      if (userIdError) return { error: userIdError };

      // Check if review already exists
      const existingReview = await this.getReviewByMatchAndUser(matchId, userId);
      if (existingReview.data) {
        return { data: false };
      }

      // Check if match is completed and user is part of it
      const { data: match, error } = await supabase
        .from(TABLES.MATCHES)
        .select("status, user_id_1, user_id_2")
        .eq("id", matchId)
        .single();

      if (error || !match) {
        return { data: false };
      }

      const isUserInMatch = match.user_id_1 === userId || match.user_id_2 === userId;
      const isMatchCompleted = match.status === "accepted";

      return { data: isUserInMatch && isMatchCompleted };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Private helper methods
   */
  private static validateReviewData(reviewData: CreateReviewData): ServiceError | null {
    const matchIdError = ValidationService.validateUUID(reviewData.matchId);
    if (matchIdError) return matchIdError;

    const revieweeIdError = ValidationService.validateUUID(reviewData.revieweeId);
    if (revieweeIdError) return revieweeIdError;

    const ratingError = ValidationService.validateRating(reviewData.rating);
    if (ratingError) return ratingError;

    const commentError = ValidationService.validateReviewComment(reviewData.comment);
    if (commentError) return commentError;

    const experienceError = ValidationService.validateRequired(reviewData.tradeExperience, "Trade experience");
    if (experienceError) return experienceError;

    const validExperiences = ["excellent", "good", "fair", "poor"];
    if (!validExperiences.includes(reviewData.tradeExperience)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid trade experience value",
      };
    }

    return null;
  }

  private static async getReviewByMatchAndUser(
    matchId: string,
    userId: string
  ): Promise<ServiceResult<ReviewWithDetails | null>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .select(
          `
          *,
          reviewer:users!reviewer_id (
            id,
            username,
            avatar_url
          ),
          reviewee:users!reviewee_id (
            id,
            username,
            avatar_url
          ),
          match:matches!match_id (
            id,
            item_id_1,
            item_id_2,
            status
          )
        `
        )
        .eq("match_id", matchId)
        .eq("reviewer_id", userId)
        .single();

      if (error && error.code === "PGRST116") {
        return { data: null };
      }

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check existing review",
            details: error,
          },
        };
      }

      const transformedData: ReviewWithDetails = {
        id: data.id,
        matchId: data.match_id,
        reviewerId: data.reviewer_id,
        revieweeId: data.reviewee_id,
        rating: data.rating,
        comment: data.comment,
        tradeExperience: data.trade_experience,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        reviewer: {
          id: data.reviewer.id,
          username: data.reviewer.username,
          avatarUrl: data.reviewer.avatar_url,
        },
        reviewee: {
          id: data.reviewee.id,
          username: data.reviewee.username,
          avatarUrl: data.reviewee.avatar_url,
        },
        match: {
          id: data.match.id,
          itemId1: data.match.item_id_1,
          itemId2: data.match.item_id_2,
          status: data.match.status,
        },
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  private static async verifyMatchAccess(
    matchId: string,
    reviewerId: string,
    revieweeId: string
  ): Promise<ServiceResult<boolean>> {
    try {
      const { data: match, error } = await supabase
        .from(TABLES.MATCHES)
        .select("user_id_1, user_id_2, status")
        .eq("id", matchId)
        .single();

      if (error || !match) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: "Match not found",
          },
        };
      }

      const isUserInMatch = match.user_id_1 === reviewerId || match.user_id_2 === reviewerId;
      const isRevieweeInMatch = match.user_id_1 === revieweeId || match.user_id_2 === revieweeId;
      const isMatchCompleted = match.status === "accepted";

      if (!isUserInMatch || !isRevieweeInMatch || !isMatchCompleted) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "You can only review completed matches you participated in",
          },
        };
      }

      return { data: true };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  private static async updateUserRating(userId: string): Promise<void> {
    try {
      const statsResult = await this.getUserReviewStats(userId);
      if (statsResult.data) {
        await supabase
          .from(TABLES.USERS)
          .update({
            rating: statsResult.data.averageRating,
            total_ratings: statsResult.data.totalReviews,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
      }
    } catch (error) {
      console.error("Failed to update user rating:", error);
    }
  }
}
