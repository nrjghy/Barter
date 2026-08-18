import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES } from "./config";

export interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  rating: number | null;
  total_ratings: number | null;
  is_demo: boolean;
  is_curator: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  signup_provider: string | null;
  item_count: number;
  connection_count: number;
  full_count: number;
}

export class AdminService {
  /**
   * Follows the same two-layer error convention as AccountService: `error`
   * below is a client/network-level failure; a separate `result.error`
   * string means the call went through but the RPC rejected it.
   */
  static async listUsers(
    search: string | null,
    limit: number,
    offset: number
  ): Promise<ServiceResult<AdminUserRow[]>> {
    try {
      const { data, error } = await supabase.rpc("admin_list_users", {
        p_search: search || null,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to load users",
            details: error,
          },
        };
      }

      return { data: (data as AdminUserRow[]) || [] };
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

  static async setUserBanned(targetUserId: string, banned: boolean): Promise<ServiceResult<boolean>> {
    try {
      const { data: result, error } = await supabase.rpc("admin_set_user_banned", {
        target_user_id: targetUserId,
        p_banned: banned,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: banned ? "Failed to suspend user" : "Failed to unban user",
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

  static async deleteUser(targetUserId: string): Promise<ServiceResult<boolean>> {
    try {
      const { data: result, error } = await supabase.rpc("admin_delete_user", {
        target_user_id: targetUserId,
      });

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

  static async setUserRole(targetUserId: string, role: "user" | "admin"): Promise<ServiceResult<boolean>> {
    try {
      const { data: result, error } = await supabase.rpc("admin_set_user_role", {
        target_user_id: targetUserId,
        p_role: role,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to change user role",
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
