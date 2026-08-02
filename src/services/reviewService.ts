import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

export interface ReviewWithDetails {
  id: string;
  tradeCompletionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
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
}

export interface CreateReviewData {
  tradeCompletionId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
}

export interface ReviewContext {
  connectionId: string;
  reviewee: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  itemLabel: string;
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

      // Check if user has already reviewed this trade
      const existingReview = await this.getReviewByTradeAndUser(reviewData.tradeCompletionId, reviewerId);
      if (existingReview.data) {
        return {
          error: {
            code: ERROR_CODES.DUPLICATE_REVIEW,
            message: ERROR_MESSAGES[ERROR_CODES.DUPLICATE_REVIEW],
          },
        };
      }

      // Verify the trade completion exists and both users are part of it.
      // Deliberately not gated on the dispute window having closed -- the
      // review reminder (send_review_reminders) is a nudge, not a gate, per
      // PRD §4.
      const tradeResult = await this.verifyTradeAccess(reviewData.tradeCompletionId, reviewerId, reviewData.revieweeId);
      if (tradeResult.error) {
        return { error: tradeResult.error };
      }

      // Create the review
      const { data, error } = await supabase
        .from(TABLES.REVIEWS)
        .insert([
          {
            trade_completion_id: reviewData.tradeCompletionId,
            reviewer_id: reviewerId,
            reviewee_id: reviewData.revieweeId,
            rating: reviewData.rating,
            comment: reviewData.comment,
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
        tradeCompletionId: review.trade_completion_id,
        reviewerId: review.reviewer_id,
        revieweeId: review.reviewee_id,
        rating: review.rating,
        comment: review.comment,
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
        tradeCompletionId: review.trade_completion_id,
        reviewerId: review.reviewer_id,
        revieweeId: review.reviewee_id,
        rating: review.rating,
        comment: review.comment,
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
        tradeCompletionId: data.trade_completion_id,
        reviewerId: data.reviewer_id,
        revieweeId: data.reviewee_id,
        rating: data.rating,
        comment: data.comment,
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

      const { data, error } = await supabase.from(TABLES.REVIEWS).select("rating").eq("reviewee_id", userId);

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

      return {
        data: {
          totalReviews,
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
          ratingDistribution,
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
   * Check if user can review a trade completion
   */
  static async canReviewTrade(tradeCompletionId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const tradeCompletionIdError = ValidationService.validateUUID(tradeCompletionId);
      const userIdError = ValidationService.validateUUID(userId);
      if (tradeCompletionIdError) return { error: tradeCompletionIdError };
      if (userIdError) return { error: userIdError };

      // Check if review already exists
      const existingReview = await this.getReviewByTradeAndUser(tradeCompletionId, userId);
      if (existingReview.data) {
        return { data: false };
      }

      // Check the trade completion exists and the user is a participant in
      // its connection. Deliberately not gated on the dispute window having
      // closed -- see the note in createReview.
      const participants = await this.getTradeConnectionParticipants(tradeCompletionId);
      if (!participants.data) {
        return { data: false };
      }

      const isParticipant = participants.data.userId1 === userId || participants.data.userId2 === userId;

      return { data: isParticipant };
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
   * Everything the review-writing screen needs to render itself, looked up
   * from just a trade completion id (the screen is reached from a
   * notification tap, not router state, so it can't rely on anything
   * being passed in-memory).
   */
  static async getReviewContext(tradeCompletionId: string, viewerId: string): Promise<ServiceResult<ReviewContext>> {
    try {
      const tradeCompletionIdError = ValidationService.validateUUID(tradeCompletionId);
      const viewerIdError = ValidationService.validateUUID(viewerId);
      if (tradeCompletionIdError) return { error: tradeCompletionIdError };
      if (viewerIdError) return { error: viewerIdError };

      const { data: tradeCompletion, error: tradeCompletionError } = await supabase
        .from(TABLES.TRADE_COMPLETIONS)
        .select("connection_id")
        .eq("id", tradeCompletionId)
        .single();

      if (tradeCompletionError || !tradeCompletion) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: "Trade completion not found",
          },
        };
      }

      const { data: connection, error: connectionError } = await supabase
        .from(TABLES.CONNECTIONS)
        .select(
          `
          id,
          user_id_1,
          user_id_2,
          user1:users!user_id_1 ( id, username, avatar_url ),
          user2:users!user_id_2 ( id, username, avatar_url )
        `
        )
        .eq("id", tradeCompletion.connection_id)
        .single();

      if (connectionError || !connection) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: "Connection not found",
          },
        };
      }

      if (connection.user_id_1 !== viewerId && connection.user_id_2 !== viewerId) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
          },
        };
      }

      const revieweeRaw: any = connection.user_id_1 === viewerId ? (connection as any).user2 : (connection as any).user1;

      const { data: tradeItems, error: itemsError } = await supabase
        .from(TABLES.TRADE_COMPLETION_ITEMS)
        .select("items ( title )")
        .eq("trade_completion_id", tradeCompletionId);

      if (itemsError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch traded items",
            details: itemsError,
          },
        };
      }

      // Multiple items per trade is expected (uneven/multi-item trades,
      // PRD §1), so this joins every traded item's title with a comma
      // rather than assuming there's exactly one.
      const itemLabel = (tradeItems || [])
        .map((row: any) => row.items?.title)
        .filter(Boolean)
        .join(", ");

      return {
        data: {
          connectionId: connection.id,
          reviewee: {
            id: revieweeRaw.id,
            username: revieweeRaw.username,
            avatarUrl: revieweeRaw.avatar_url,
          },
          itemLabel,
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
   * Private helper methods
   */
  private static validateReviewData(reviewData: CreateReviewData): ServiceError | null {
    const tradeCompletionIdError = ValidationService.validateUUID(reviewData.tradeCompletionId);
    if (tradeCompletionIdError) return tradeCompletionIdError;

    const revieweeIdError = ValidationService.validateUUID(reviewData.revieweeId);
    if (revieweeIdError) return revieweeIdError;

    const ratingError = ValidationService.validateRating(reviewData.rating);
    if (ratingError) return ratingError;

    const commentError = ValidationService.validateReviewComment(reviewData.comment);
    if (commentError) return commentError;

    return null;
  }

  private static async getReviewByTradeAndUser(
    tradeCompletionId: string,
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
          )
        `
        )
        .eq("trade_completion_id", tradeCompletionId)
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
        tradeCompletionId: data.trade_completion_id,
        reviewerId: data.reviewer_id,
        revieweeId: data.reviewee_id,
        rating: data.rating,
        comment: data.comment,
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
   * Looks up the two participants of the connection behind a trade
   * completion. Returns { data: null } (not an error) if the trade
   * completion or its connection can't be found, so callers that only care
   * about "can this user act on it" (canReviewTrade) can treat not-found and
   * not-a-participant the same way, while callers that need to distinguish
   * the two (verifyTradeAccess) still can.
   */
  private static async getTradeConnectionParticipants(
    tradeCompletionId: string
  ): Promise<ServiceResult<{ userId1: string; userId2: string } | null>> {
    const { data: tradeCompletion, error } = await supabase
      .from(TABLES.TRADE_COMPLETIONS)
      .select("connection_id")
      .eq("id", tradeCompletionId)
      .single();

    if (error || !tradeCompletion) {
      return { data: null };
    }

    const { data: connection, error: connectionError } = await supabase
      .from(TABLES.CONNECTIONS)
      .select("user_id_1, user_id_2")
      .eq("id", tradeCompletion.connection_id)
      .single();

    if (connectionError || !connection) {
      return { data: null };
    }

    return { data: { userId1: connection.user_id_1, userId2: connection.user_id_2 } };
  }

  private static async verifyTradeAccess(
    tradeCompletionId: string,
    reviewerId: string,
    revieweeId: string
  ): Promise<ServiceResult<boolean>> {
    try {
      const participants = await this.getTradeConnectionParticipants(tradeCompletionId);
      if (!participants.data) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: "Trade completion not found",
          },
        };
      }

      const { userId1, userId2 } = participants.data;
      const isReviewerParticipant = userId1 === reviewerId || userId2 === reviewerId;
      const isRevieweeParticipant = userId1 === revieweeId || userId2 === revieweeId;

      if (!isReviewerParticipant || !isRevieweeParticipant) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "You can only review trades you participated in",
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
