import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

export interface MatchWithItems {
  id: string;
  itemId1: string;
  itemId2: string;
  userId1: string;
  userId2: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  completedBy?: string;
  isSuperLike: boolean;
  item1: {
    id: string;
    title: string;
    description: string;
    imageUrl?: string;
    user: {
      id: string;
      username: string;
      avatarUrl?: string;
    };
  };
  item2: {
    id: string;
    title: string;
    description: string;
    imageUrl?: string;
    user: {
      id: string;
      username: string;
      avatarUrl?: string;
    };
  };
}

export interface UpdateMatchData {
  status: "accepted" | "rejected";
  completedBy?: string;
}

export class MatchService {
  /**
   * Get all matches for a user
   */
  static async getUserMatches(userId: string): Promise<ServiceResult<MatchWithItems[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MATCHES)
        .select(
          `
          *,
          item1:items!item_id_1 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          ),
          item2:items!item_id_2 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          )
        `
        )
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch matches",
            details: error,
          },
        };
      }

      const transformedData: MatchWithItems[] = data.map((match: any) => ({
        id: match.id,
        itemId1: match.item_id_1,
        itemId2: match.item_id_2,
        userId1: match.user_id_1,
        userId2: match.user_id_2,
        status: match.status,
        createdAt: match.created_at,
        updatedAt: match.updated_at,
        completedAt: match.completed_at,
        completedBy: match.completed_by,
        isSuperLike: match.is_super_like,
        item1: {
          id: match.item1.id,
          title: match.item1.title,
          description: match.item1.description,
          imageUrl: match.item1.image_url,
          user: {
            id: match.item1.users.id,
            username: match.item1.users.username,
            avatarUrl: match.item1.users.avatar_url,
          },
        },
        item2: {
          id: match.item2.id,
          title: match.item2.title,
          description: match.item2.description,
          imageUrl: match.item2.image_url,
          user: {
            id: match.item2.users.id,
            username: match.item2.users.username,
            avatarUrl: match.item2.users.avatar_url,
          },
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
   * Get a single match by ID
   */
  static async getMatch(matchId: string): Promise<ServiceResult<MatchWithItems>> {
    try {
      const uuidError = ValidationService.validateUUID(matchId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MATCHES)
        .select(
          `
          *,
          item1:items!item_id_1 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          ),
          item2:items!item_id_2 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          )
        `
        )
        .eq("id", matchId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.ITEM_NOT_FOUND,
              message: "Match not found",
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch match",
            details: error,
          },
        };
      }

      const transformedData: MatchWithItems = {
        id: data.id,
        itemId1: data.item_id_1,
        itemId2: data.item_id_2,
        userId1: data.user_id_1,
        userId2: data.user_id_2,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        completedAt: data.completed_at,
        completedBy: data.completed_by,
        isSuperLike: data.is_super_like,
        item1: {
          id: data.item1.id,
          title: data.item1.title,
          description: data.item1.description,
          imageUrl: data.item1.image_url,
          user: {
            id: data.item1.users.id,
            username: data.item1.users.username,
            avatarUrl: data.item1.users.avatar_url,
          },
        },
        item2: {
          id: data.item2.id,
          title: data.item2.title,
          description: data.item2.description,
          imageUrl: data.item2.image_url,
          user: {
            id: data.item2.users.id,
            username: data.item2.users.username,
            avatarUrl: data.item2.users.avatar_url,
          },
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
   * Update match status
   */
  static async updateMatch(
    matchId: string,
    updateData: UpdateMatchData,
    userId: string
  ): Promise<ServiceResult<boolean>> {
    try {
      const matchIdError = ValidationService.validateUUID(matchId);
      const userIdError = ValidationService.validateUUID(userId);
      if (matchIdError) return { error: matchIdError };
      if (userIdError) return { error: userIdError };

      // Validate status
      if (!["accepted", "rejected"].includes(updateData.status)) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Invalid match status",
          },
        };
      }

      // Check if user is part of the match
      const matchResult = await this.getMatch(matchId);
      if (matchResult.error) {
        return { error: matchResult.error };
      }

      const match = matchResult.data!;
      if (match.userId1 !== userId && match.userId2 !== userId) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
          },
        };
      }

      // Update the match
      const { error } = await supabase
        .from(TABLES.MATCHES)
        .update({
          status: updateData.status,
          completed_at: updateData.status === "accepted" ? new Date().toISOString() : null,
          completed_by: updateData.completedBy || userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to update match",
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

  /**
   * Get pending matches for a user
   */
  static async getPendingMatches(userId: string): Promise<ServiceResult<MatchWithItems[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MATCHES)
        .select(
          `
          *,
          item1:items!item_id_1 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          ),
          item2:items!item_id_2 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          )
        `
        )
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch pending matches",
            details: error,
          },
        };
      }

      const transformedData: MatchWithItems[] = data.map((match: any) => ({
        id: match.id,
        itemId1: match.item_id_1,
        itemId2: match.item_id_2,
        userId1: match.user_id_1,
        userId2: match.user_id_2,
        status: match.status,
        createdAt: match.created_at,
        updatedAt: match.updated_at,
        completedAt: match.completed_at,
        completedBy: match.completed_by,
        isSuperLike: match.is_super_like,
        item1: {
          id: match.item1.id,
          title: match.item1.title,
          description: match.item1.description,
          imageUrl: match.item1.image_url,
          user: {
            id: match.item1.users.id,
            username: match.item1.users.username,
            avatarUrl: match.item1.users.avatar_url,
          },
        },
        item2: {
          id: match.item2.id,
          title: match.item2.title,
          description: match.item2.description,
          imageUrl: match.item2.image_url,
          user: {
            id: match.item2.users.id,
            username: match.item2.users.username,
            avatarUrl: match.item2.users.avatar_url,
          },
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
   * Get completed matches for a user
   */
  static async getCompletedMatches(userId: string): Promise<ServiceResult<MatchWithItems[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MATCHES)
        .select(
          `
          *,
          item1:items!item_id_1 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          ),
          item2:items!item_id_2 (
            id,
            title,
            description,
            image_url,
            users (
              id,
              username,
              avatar_url
            )
          )
        `
        )
        .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`)
        .in("status", ["accepted", "rejected"])
        .order("updated_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch completed matches",
            details: error,
          },
        };
      }

      const transformedData: MatchWithItems[] = data.map((match: any) => ({
        id: match.id,
        itemId1: match.item_id_1,
        itemId2: match.item_id_2,
        userId1: match.user_id_1,
        userId2: match.user_id_2,
        status: match.status,
        createdAt: match.created_at,
        updatedAt: match.updated_at,
        completedAt: match.completed_at,
        completedBy: match.completed_by,
        isSuperLike: match.is_super_like,
        item1: {
          id: match.item1.id,
          title: match.item1.title,
          description: match.item1.description,
          imageUrl: match.item1.image_url,
          user: {
            id: match.item1.users.id,
            username: match.item1.users.username,
            avatarUrl: match.item1.users.avatar_url,
          },
        },
        item2: {
          id: match.item2.id,
          title: match.item2.title,
          description: match.item2.description,
          imageUrl: match.item2.image_url,
          user: {
            id: match.item2.users.id,
            username: match.item2.users.username,
            avatarUrl: match.item2.users.avatar_url,
          },
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
}
