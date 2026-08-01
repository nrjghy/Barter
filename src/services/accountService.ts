import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES } from "./config";

export class AccountService {
  /**
   * Deletes the caller's own account via the delete_own_account RPC. Has to
   * be an RPC, not a plain client update, since it anonymizes the users row,
   * cancels active items, fans out "item no longer available" notifications,
   * and deletes the auth.users row all as one caller-scoped operation.
   *
   * Follows the same two-layer error convention as completeTrade: `error`
   * below is a client/network-level failure; a separate `result.error`
   * string means the call went through but the function rejected it (e.g.
   * not authenticated).
   */
  static async deleteOwnAccount(): Promise<ServiceResult<boolean>> {
    try {
      const { data: result, error } = await supabase.rpc("delete_own_account");

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to delete account",
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
