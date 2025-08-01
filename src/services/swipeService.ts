import { supabase } from "../lib/supabase";
import { SwipeData, SwipeLimitData, MatchData, ServiceResult, ServiceError } from "./types";
import { APP_CONFIG, ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

export class SwipeService {
  /**
   * Check if a user can swipe (within daily limit)
   */
  static async checkSwipeLimit(userId: string): Promise<ServiceResult<SwipeLimitData>> {
    try {
      // Validate input
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      // Check if user can swipe using RPC function
      const { data: canSwipe, error: rpcError } = await supabase.rpc("can_user_swipe", {
        user_uuid: userId,
      });

      if (rpcError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check swipe limit",
            details: rpcError,
          },
        };
      }

      // Get current swipe count
      const { data: userData, error: userError } = await supabase
        .from(TABLES.USERS)
        .select("daily_swipes")
        .eq("id", userId)
        .single();

      if (userError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to get user swipe count",
            details: userError,
          },
        };
      }

      return {
        data: {
          canSwipe: canSwipe as boolean,
          dailySwipeCount: userData?.daily_swipes ?? 0,
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
   * Record a swipe and handle match creation
   */
  static async recordSwipe(swipeData: SwipeData): Promise<ServiceResult<boolean>> {
    try {
      // Validate input
      const validationError = this.validateSwipeData(swipeData);
      if (validationError) {
        return { error: validationError };
      }

      // Check swipe limit first
      const limitResult = await this.checkSwipeLimit(swipeData.userId);
      if (limitResult.error) {
        return { error: limitResult.error };
      }

      if (!limitResult.data?.canSwipe) {
        return {
          error: {
            code: ERROR_CODES.SWIPE_LIMIT_EXCEEDED,
            message: ERROR_MESSAGES[ERROR_CODES.SWIPE_LIMIT_EXCEEDED],
          },
        };
      }

      // Record the swipe
      const { error: swipeError } = await supabase.from(TABLES.SWIPES).insert([
        {
          user_id: swipeData.userId,
          item_id: swipeData.itemId,
          direction: swipeData.direction,
        },
      ]);

      if (swipeError && !swipeError.message.includes("duplicate")) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to record swipe",
            details: swipeError,
          },
        };
      }

      // Increment swipe count
      await supabase.rpc("increment_swipe_count", { user_uuid: swipeData.userId });

      // If it's a right swipe or super like, check for matches
      if (swipeData.direction === "right" || swipeData.direction === "super") {
        const matchResult = await this.checkForMatch(
          swipeData.userId,
          swipeData.itemId,
          swipeData.direction === "super"
        );

        if (matchResult.error) {
          // Log the error but don't fail the swipe
          console.error("Match creation failed:", matchResult.error);
        }
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

  /**
   * Check for potential matches and create them
   */
  static async checkForMatch(
    userId: string,
    itemId: string,
    isSuperLike: boolean = false
  ): Promise<ServiceResult<MatchData | null>> {
    try {
      // Validate inputs
      const userIdError = ValidationService.validateUUID(userId);
      const itemIdError = ValidationService.validateUUID(itemId);
      if (userIdError) return { error: userIdError };
      if (itemIdError) return { error: itemIdError };

      // Get the item details
      const { data: item, error: itemError } = await supabase
        .from(TABLES.ITEMS)
        .select("user_id, title")
        .eq("id", itemId)
        .single();

      if (itemError || !item) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: ERROR_MESSAGES[ERROR_CODES.ITEM_NOT_FOUND],
            details: itemError,
          },
        };
      }

      // Get current user's active items
      const { data: userItems, error: userItemsError } = await supabase
        .from(TABLES.ITEMS)
        .select("id")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (userItemsError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to get user items",
            details: userItemsError,
          },
        };
      }

      if (!userItems || userItems.length === 0) {
        return { data: null }; // No match possible if user has no items
      }

      const userItemIds = userItems.map((item) => item.id);

      // Check if other user swiped right on any of our items
      const { data: mutualSwipes, error: swipesError } = await supabase
        .from(TABLES.SWIPES)
        .select("item_id")
        .eq("user_id", item.user_id)
        .in("item_id", userItemIds)
        .in("direction", ["right", "super"]);

      if (swipesError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check mutual swipes",
            details: swipesError,
          },
        };
      }

      if (mutualSwipes && mutualSwipes.length > 0) {
        const otherUserSwipe = mutualSwipes[0];

        // Check if match already exists
        const existingMatchResult = await this.checkExistingMatch(otherUserSwipe.item_id, itemId);

        if (existingMatchResult.error) {
          return { error: existingMatchResult.error };
        }

        if (existingMatchResult.data) {
          return { data: null }; // Match already exists
        }

        // Create the match
        const matchData: MatchData = {
          itemId1: otherUserSwipe.item_id,
          itemId2: itemId,
          userId1: userId,
          userId2: item.user_id,
          isSuperLike,
        };

        const createResult = await this.createMatch(matchData);
        if (createResult.error) {
          return { error: createResult.error };
        }

        return { data: matchData };
      }

      return { data: null }; // No match found
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
   * Get all items a user has swiped on
   */
  static async getSwipedItems(userId: string): Promise<ServiceResult<string[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase.from(TABLES.SWIPES).select("item_id").eq("user_id", userId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to get swiped items",
            details: error,
          },
        };
      }

      return {
        data: data.map((swipe) => swipe.item_id),
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
  private static validateSwipeData(swipeData: SwipeData): ServiceError | null {
    const userIdError = ValidationService.validateUUID(swipeData.userId);
    if (userIdError) return userIdError;

    const itemIdError = ValidationService.validateUUID(swipeData.itemId);
    if (itemIdError) return itemIdError;

    const directionError = ValidationService.validateSwipeDirection(swipeData.direction);
    if (directionError) return directionError;

    return null;
  }

  private static async checkExistingMatch(itemId1: string, itemId2: string): Promise<ServiceResult<boolean>> {
    try {
      const { data: existingMatches, error } = await supabase
        .from(TABLES.MATCHES)
        .select("id")
        .or(
          `and(item_id_1.eq.${itemId1},item_id_2.eq.${itemId2}),and(item_id_1.eq.${itemId2},item_id_2.eq.${itemId1})`
        );

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check existing match",
            details: error,
          },
        };
      }

      return { data: existingMatches && existingMatches.length > 0 };
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

  private static async createMatch(matchData: MatchData): Promise<ServiceResult<boolean>> {
    try {
      const { error } = await supabase.from(TABLES.MATCHES).insert([
        {
          item_id_1: matchData.itemId1,
          item_id_2: matchData.itemId2,
          user_id_1: matchData.userId1,
          user_id_2: matchData.userId2,
          is_super_like: matchData.isSuperLike,
          status: "pending",
        },
      ]);

      if (error) {
        if (error.message.includes("duplicate")) {
          return { data: true }; // Match already exists, consider it successful
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to create match",
            details: error,
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
}
