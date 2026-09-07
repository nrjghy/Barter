import { supabase } from "../lib/supabase";
import { ServiceResult } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  location?: string;
  avatarUrl?: string;
  role: string;
  rating?: number;
  totalRatings?: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserData {
  username?: string;
  location?: string;
  avatarUrl?: string;
}

export class UserService {
  /**
   * Get user profile by ID
   */
  static async getUserProfile(userId: string): Promise<ServiceResult<UserProfile>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase.from(TABLES.USERS).select("*").eq("id", userId).single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.USER_NOT_FOUND,
              message: ERROR_MESSAGES[ERROR_CODES.USER_NOT_FOUND],
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user profile",
            details: error,
          },
        };
      }

      const transformedData: UserProfile = {
        id: data.id,
        username: data.username,
        email: data.email,
        location: data.location,
        avatarUrl: data.avatar_url,
        role: data.role,
        rating: data.rating,
        totalRatings: data.total_ratings,

        createdAt: data.created_at,
        updatedAt: data.updated_at,
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
   * Update user profile
   */
  static async updateUserProfile(userId: string, updateData: UpdateUserData): Promise<ServiceResult<UserProfile>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      // Validate username if provided
      if (updateData.username) {
        const usernameError = ValidationService.validateUsername(updateData.username);
        if (usernameError) {
          return { error: usernameError };
        }
      }

      const { data, error } = await supabase
        .from(TABLES.USERS)
        .update({
          username: updateData.username,
          location: updateData.location,
          avatar_url: updateData.avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to update user profile",
            details: error,
          },
        };
      }

      const transformedData: UserProfile = {
        id: data.id,
        username: data.username,
        email: data.email,
        location: data.location,
        avatarUrl: data.avatar_url,
        role: data.role,
        rating: data.rating,
        totalRatings: data.total_ratings,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
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
   * Get user by username
   */
  static async getUserByUsername(username: string): Promise<ServiceResult<UserProfile>> {
    try {
      const usernameError = ValidationService.validateUsername(username);
      if (usernameError) {
        return { error: usernameError };
      }

      const { data, error } = await supabase.from(TABLES.USERS).select("*").eq("username", username).single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.USER_NOT_FOUND,
              message: ERROR_MESSAGES[ERROR_CODES.USER_NOT_FOUND],
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user by username",
            details: error,
          },
        };
      }

      const transformedData: UserProfile = {
        id: data.id,
        username: data.username,
        email: data.email,
        location: data.location,
        avatarUrl: data.avatar_url,
        role: data.role,
        rating: data.rating,
        totalRatings: data.total_ratings,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
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
   * Check if username is available
   */
  static async isUsernameAvailable(username: string): Promise<ServiceResult<boolean>> {
    try {
      const usernameError = ValidationService.validateUsername(username);
      if (usernameError) {
        return { error: usernameError };
      }

      const { error } = await supabase.from(TABLES.USERS).select("id").eq("username", username).single();

      if (error && error.code === "PGRST116") {
        return { data: true }; // Username is available
      }

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check username availability",
            details: error,
          },
        };
      }

      return { data: false }; // Username is taken
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
   * Get user statistics
   */
  static async getUserStats(userId: string): Promise<
    ServiceResult<{
      totalItems: number;
      activeItems: number;
      totalMatches: number;
      pendingMatches: number;
      completedMatches: number;
      averageRating: number;
    }>
  > {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      // Get item counts
      const { data: itemsData, error: itemsError } = await supabase
        .from(TABLES.ITEMS)
        .select("is_active")
        .eq("user_id", userId);

      if (itemsError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user items",
            details: itemsError,
          },
        };
      }

      const totalItems = itemsData.length;
      const activeItems = itemsData.filter((item) => item.is_active).length;

      // Get match counts
      const { data: matchesData, error: matchesError } = await supabase
        .from(TABLES.MATCHES)
        .select("status")
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

      if (matchesError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user matches",
            details: matchesError,
          },
        };
      }

      const totalMatches = matchesData.length;
      const pendingMatches = matchesData.filter((match) => match.status === "pending").length;
      const completedMatches = matchesData.filter(
        (match) => match.status === "accepted" || match.status === "rejected"
      ).length;

      // Get user rating
      const { data: userData, error: userError } = await supabase
        .from(TABLES.USERS)
        .select("rating")
        .eq("id", userId)
        .single();

      if (userError) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user rating",
            details: userError,
          },
        };
      }

      return {
        data: {
          totalItems,
          activeItems,
          totalMatches,
          pendingMatches,
          completedMatches,
          averageRating: userData.rating || 0,
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
   * Delete user account
   */
  static async deleteUser(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      // Note: This is a soft delete - we'll just deactivate the user
      const { error } = await supabase
        .from(TABLES.USERS)
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to delete user",
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
