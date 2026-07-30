import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES } from "./config";
import { ValidationService } from "./validation";

export interface TradeCompletionResult {
  tradeCompletionId: string;
  disputeDeadline: string;
}

export class TradeCompletionService {
  /**
   * Marks a trade complete via the complete_trade RPC. This has to be an
   * RPC, not a plain client insert/update, since completing a trade needs
   * to mark BOTH people's items as traded, and items' RLS only lets an
   * owner update their own row.
   *
   * Follows the same two-layer error convention as check_and_create_match:
   * `error` below is a client/network-level failure (the call itself
   * didn't go through); a separate `result.error` string inside the RPC's
   * own jsonb response means the call went through fine but the function
   * rejected it (not a participant, item no longer active, etc).
   */
  static async completeTrade(connectionId: string, itemIds: string[]): Promise<ServiceResult<TradeCompletionResult>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      if (connectionIdError) return { error: connectionIdError };

      if (!itemIds || itemIds.length === 0) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Select at least one item to mark as traded",
          },
        };
      }

      for (const itemId of itemIds) {
        const itemIdError = ValidationService.validateUUID(itemId);
        if (itemIdError) return { error: itemIdError };
      }

      const { data: result, error } = await supabase.rpc("complete_trade", {
        for_connection_id: connectionId,
        traded_item_ids: itemIds,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to complete trade",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
          },
        };
      }

      return {
        data: {
          tradeCompletionId: result.tradeCompletionId,
          disputeDeadline: result.disputeDeadline,
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
}
