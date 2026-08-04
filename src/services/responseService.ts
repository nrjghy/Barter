import { supabase } from "../lib/supabase";
import { ResponseData, LikeLimitData, ResponseResult, ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";
import { trackEvent } from "../lib/analytics";

export class ResponseService {
  /**
   * Check if a user can like (within daily limit)
   */
  static async checkLikeLimit(userId: string): Promise<ServiceResult<LikeLimitData>> {
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

      // PRD §3: the daily like limit is a tunable config value, not a
      // hardcoded number -- read it fresh rather than assuming it's
      // still whatever it was when this file was last touched. Falls
      // back to 300 rather than failing the whole check if the row is
      // ever missing.
      const { data: settingData } = await supabase
        .from(TABLES.APP_SETTINGS)
        .select("value")
        .eq("key", "daily_like_limit")
        .single();

      const limit = typeof settingData?.value === "number" ? settingData.value : 300;

      return {
        data: {
          canSwipe: canSwipe as boolean,
          dailySwipeCount: userData?.daily_swipes ?? 0,
          limit,
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
   * Undo a previously-recorded like/pass (Dashboard's Undo button). This is a
   * real server-side reversal via the undo_response RPC -- it was previously
   * client-state-only, meaning the original response was never actually
   * removed and the daily like counter was never given back. Refuses (rather
   * than silently no-op'ing) if the like has already resulted in a
   * connection, since reversing an already-formed match is a materially
   * different, more consequential action than undoing a quick mis-tap.
   */
  static async undoResponse(userId: string, itemId: string): Promise<ServiceResult<{ success: true }>> {
    try {
      const { data: result, error: rpcError } = await supabase.rpc("undo_response", {
        user_uuid: userId,
        target_item_id: itemId,
      });

      if (rpcError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR],
            details: rpcError,
          },
        };
      }

      if (result?.error) {
        if (result.alreadyMatched) {
          return {
            error: {
              code: ERROR_CODES.MATCH_ALREADY_EXISTS,
              message: ERROR_MESSAGES[ERROR_CODES.MATCH_ALREADY_EXISTS],
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: result.error,
          },
        };
      }

      return { data: { success: true } };
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
   * Record a response (pass or like) with optimized performance
   */
  static async recordResponse(data: ResponseData): Promise<ServiceResult<ResponseResult>> {
    try {
      // Validate input
      const validationError = this.validateResponseData(data);
      if (validationError) {
        return { error: validationError };
      }

      const { data: result, error: rpcError } = await supabase.rpc("record_response_optimized", {
        user_uuid: data.userId,
        target_item_id: data.itemId,
        response_direction: data.direction,
      });

      if (rpcError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to record swipe",
            details: rpcError,
          },
        };
      }

      // Handle errors returned by the RPC function
      if (result?.error) {
        if (result.error.includes("Daily swipe limit reached")) {
          return {
            error: {
              code: ERROR_CODES.LIKE_LIMIT_EXCEEDED,
              message: ERROR_MESSAGES[ERROR_CODES.LIKE_LIMIT_EXCEEDED],
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: result.error,
          },
        };
      }

      // Handle match checking in background if needed
      if (result?.matchCheckNeeded && result?.targetItemUserId) {
        // Don't await this - let it run in background
        this.handleBackgroundMatchCheck(data.userId, data.itemId).catch((error) => {
          console.error("Background match creation failed:", error);
        });
      }

      return {
        data: {
          success: true,
          dailySwipeCount: result?.dailySwipeCount || 0,
          canSwipe: result?.canSwipe || false,
          matchCheckNeeded: result?.matchCheckNeeded || false,
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
   * Handle match checking in background
   */
  private static async handleBackgroundMatchCheck(userId: string, itemId: string): Promise<void> {
    try {
      const { data: result, error } = await supabase.rpc("check_and_create_match", {
        responder_user_id: userId,
        target_item_id: itemId,
      });

      if (error) {
        console.error("Match check RPC error:", error);
        return;
      }

      if (result?.matchCreated) {
        console.log("Match created successfully:", result.connectionId);
        // PRD §17 core conversion funnel, step 4: match/connection created.
        // Only for a genuinely new connection -- a repeat mutual like on an
        // already-existing connection (isNewConnection: false) isn't a new
        // funnel completion.
        if (result.isNewConnection) {
          trackEvent("connection_created", { connectionId: result.connectionId });
        }
      }
    } catch (error) {
      console.error("Background match check failed:", error);
    }
  }

  /**
   * Get all items a user has responded to
   */
  static async getRespondedItems(userId: string): Promise<ServiceResult<string[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase.from(TABLES.RESPONSES).select("item_id").eq("user_id", userId);

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
        data: data.map((response) => response.item_id),
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
  private static validateResponseData(data: ResponseData): ServiceError | null {
    const userIdError = ValidationService.validateUUID(data.userId);
    if (userIdError) return userIdError;

    const itemIdError = ValidationService.validateUUID(data.itemId);
    if (itemIdError) return itemIdError;

    const directionError = ValidationService.validateResponseDirection(data.direction);
    if (directionError) return directionError;

    return null;
  }
}
