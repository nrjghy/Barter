import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES, BUSINESS_RULES } from "./config";
import { ValidationService } from "./validation";

export interface MessageWithDetails {
  id: string;
  matchId: string;
  senderId: string;
  content: string;
  messageType: "text" | "image" | "location" | "trade_offer";
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  readAt?: string;
  sender: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
}

export interface CreateMessageData {
  matchId: string;
  content: string;
  messageType: "text" | "image" | "location" | "trade_offer";
  data?: Record<string, unknown>;
}

export interface MessageStats {
  totalMessages: number;
  unreadCount: number;
  messagesByType: Record<string, number>;
  recentMessages: MessageWithDetails[];
}

export class MessageService {
  /**
   * Send a new message
   */
  static async sendMessage(
    messageData: CreateMessageData,
    senderId: string
  ): Promise<ServiceResult<MessageWithDetails>> {
    try {
      // Validate input
      const validationError = this.validateMessageData(messageData);
      if (validationError) {
        return { error: validationError };
      }

      const senderIdError = ValidationService.validateUUID(senderId);
      if (senderIdError) {
        return { error: senderIdError };
      }

      // Verify user is part of the match
      const matchAccess = await this.verifyMatchAccess(messageData.matchId, senderId);
      if (matchAccess.error) {
        return { error: matchAccess.error };
      }

      // Check message rate limiting
      const rateLimitCheck = await this.checkRateLimit(senderId);
      if (rateLimitCheck.error) {
        return { error: rateLimitCheck.error };
      }

      // Create the message
      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .insert([
          {
            match_id: messageData.matchId,
            sender_id: senderId,
            content: messageData.content,
            message_type: messageData.messageType,
            data: messageData.data,
            is_read: false,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to send message",
            details: error,
          },
        };
      }

      // Get the full message details
      const fullMessage = await this.getMessage(data.id);
      if (fullMessage.error) {
        return { error: fullMessage.error };
      }

      return { data: fullMessage.data! };
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
   * Get messages for a match
   */
  static async getMatchMessages(
    matchId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ServiceResult<MessageWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(matchId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .select(
          `
          *,
          sender:users!sender_id (
            id,
            username,
            avatar_url
          )
        `
        )
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch messages",
            details: error,
          },
        };
      }

      const transformedData: MessageWithDetails[] = data.map((message: any) => ({
        id: message.id,
        matchId: message.match_id,
        senderId: message.sender_id,
        content: message.content,
        messageType: message.message_type,
        data: message.data,
        isRead: message.is_read,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        readAt: message.read_at,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          avatarUrl: message.sender.avatar_url,
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
   * Get unread messages for a user in a match
   */
  static async getUnreadMessages(matchId: string, userId: string): Promise<ServiceResult<MessageWithDetails[]>> {
    try {
      const matchIdError = ValidationService.validateUUID(matchId);
      const userIdError = ValidationService.validateUUID(userId);
      if (matchIdError) return { error: matchIdError };
      if (userIdError) return { error: userIdError };

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .select(
          `
          *,
          sender:users!sender_id (
            id,
            username,
            avatar_url
          )
        `
        )
        .eq("match_id", matchId)
        .eq("is_read", false)
        .neq("sender_id", userId) // Only messages from other users
        .order("created_at", { ascending: true });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch unread messages",
            details: error,
          },
        };
      }

      const transformedData: MessageWithDetails[] = data.map((message: any) => ({
        id: message.id,
        matchId: message.match_id,
        senderId: message.sender_id,
        content: message.content,
        messageType: message.message_type,
        data: message.data,
        isRead: message.is_read,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        readAt: message.read_at,
        sender: {
          id: message.sender.id,
          username: message.sender.username,
          avatarUrl: message.sender.avatar_url,
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
   * Mark messages as read
   */
  static async markMessagesAsRead(
    matchId: string,
    userId: string,
    messageIds?: string[]
  ): Promise<ServiceResult<boolean>> {
    try {
      const matchIdError = ValidationService.validateUUID(matchId);
      const userIdError = ValidationService.validateUUID(userId);
      if (matchIdError) return { error: matchIdError };
      if (userIdError) return { error: userIdError };

      let query = supabase
        .from(TABLES.MESSAGES)
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("match_id", matchId)
        .eq("is_read", false)
        .neq("sender_id", userId); // Only mark messages from other users as read

      if (messageIds && messageIds.length > 0) {
        // Validate all message IDs
        for (const messageId of messageIds) {
          const messageIdError = ValidationService.validateUUID(messageId);
          if (messageIdError) return { error: messageIdError };
        }
        query = query.in("id", messageIds);
      }

      const { error } = await query;

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to mark messages as read",
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
   * Get a single message by ID
   */
  static async getMessage(messageId: string): Promise<ServiceResult<MessageWithDetails>> {
    try {
      const uuidError = ValidationService.validateUUID(messageId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .select(
          `
          *,
          sender:users!sender_id (
            id,
            username,
            avatar_url
          )
        `
        )
        .eq("id", messageId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.ITEM_NOT_FOUND,
              message: "Message not found",
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch message",
            details: error,
          },
        };
      }

      const transformedData: MessageWithDetails = {
        id: data.id,
        matchId: data.match_id,
        senderId: data.sender_id,
        content: data.content,
        messageType: data.message_type,
        data: data.data,
        isRead: data.is_read,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        readAt: data.read_at,
        sender: {
          id: data.sender.id,
          username: data.sender.username,
          avatarUrl: data.sender.avatar_url,
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
   * Delete a message (only sender can delete)
   */
  static async deleteMessage(messageId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const messageIdError = ValidationService.validateUUID(messageId);
      const userIdError = ValidationService.validateUUID(userId);
      if (messageIdError) return { error: messageIdError };
      if (userIdError) return { error: userIdError };

      // Verify user is the sender
      const message = await this.getMessage(messageId);
      if (message.error) {
        return { error: message.error };
      }

      if (message.data!.senderId !== userId) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "You can only delete your own messages",
          },
        };
      }

      const { error } = await supabase.from(TABLES.MESSAGES).delete().eq("id", messageId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to delete message",
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
   * Get message statistics for a match
   */
  static async getMessageStats(matchId: string): Promise<ServiceResult<MessageStats>> {
    try {
      const uuidError = ValidationService.validateUUID(matchId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .select("*")
        .eq("match_id", matchId)
        .order("created_at", { ascending: false })
        .limit(100); // Get recent messages for stats

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch message statistics",
            details: error,
          },
        };
      }

      const totalMessages = data.length;
      const unreadCount = data.filter((message) => !message.is_read).length;

      const messagesByType = data.reduce((acc, message) => {
        acc[message.message_type] = (acc[message.message_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const recentMessages: MessageWithDetails[] = data.slice(0, 10).map((message: any) => ({
        id: message.id,
        matchId: message.match_id,
        senderId: message.sender_id,
        content: message.content,
        messageType: message.message_type,
        data: message.data,
        isRead: message.is_read,
        createdAt: message.created_at,
        updatedAt: message.updated_at,
        readAt: message.read_at,
        sender: {
          id: message.sender?.id || "",
          username: message.sender?.username || "",
          avatarUrl: message.sender?.avatar_url,
        },
      }));

      return {
        data: {
          totalMessages,
          unreadCount,
          messagesByType,
          recentMessages,
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
   * Get unread message count for a user across all matches
   */
  static async getUnreadMessageCount(userId: string): Promise<ServiceResult<number>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { count, error } = await supabase
        .from(TABLES.MESSAGES)
        .select("*", { count: "exact", head: true })
        .eq("is_read", false)
        .neq("sender_id", userId); // Only count messages from other users

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to get unread message count",
            details: error,
          },
        };
      }

      return { data: count || 0 };
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
  private static validateMessageData(messageData: CreateMessageData): ServiceError | null {
    const matchIdError = ValidationService.validateUUID(messageData.matchId);
    if (matchIdError) return matchIdError;

    const contentError = ValidationService.validateRequired(messageData.content, "Content");
    if (contentError) return contentError;

    const validTypes = ["text", "image", "location", "trade_offer"];
    if (!validTypes.includes(messageData.messageType)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid message type",
      };
    }

    if (messageData.content.length > 1000) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Message content is too long",
      };
    }

    return null;
  }

  private static async verifyMatchAccess(matchId: string, userId: string): Promise<ServiceResult<boolean>> {
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

      const isUserInMatch = match.user_id_1 === userId || match.user_id_2 === userId;
      const isMatchActive = match.status === "pending" || match.status === "accepted";

      if (!isUserInMatch || !isMatchActive) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "You can only send messages in active matches you participate in",
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

  private static async checkRateLimit(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const now = new Date();
      const rateLimitWindow = new Date(now.getTime() - BUSINESS_RULES.message.rateLimitWindowMs);

      const { count, error } = await supabase
        .from(TABLES.MESSAGES)
        .select("*", { count: "exact", head: true })
        .eq("sender_id", userId)
        .gte("created_at", rateLimitWindow.toISOString());

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check rate limit",
            details: error,
          },
        };
      }

      if (count && count >= BUSINESS_RULES.message.maxMessagesPerWindow) {
        return {
          error: {
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: "Message rate limit exceeded. Please wait before sending another message.",
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
