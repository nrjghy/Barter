import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES, BUSINESS_RULES } from "./config";
import { ValidationService } from "./validation";

// -----------------------------------------------------------------------------
// Updated for the connection-model rewrite: match_id -> connection_id
// throughout (messages.match_id was dropped and replaced by
// messages.connection_id in 20260725000000_connection_model.sql), and
// message_type widened from the old (text/image/template) set to the
// agreed four-type model from PRD §5: text/photo/location/system (see
// 20260726000001_reconcile_message_types.sql).
//
// "system" is deliberately NOT part of CreateMessageData / validTypes below.
// System messages (e.g. the Mark Trade Complete confirmation) are meant to
// be inserted server-side, not sent by a user through this method. Note
// this is currently enforced only at this service layer, not by RLS -- the
// messages insert policy checks sender_id/connection membership, not
// message_type, so a client could still insert a 'system' row by calling
// Supabase directly rather than through this service. Worth a follow-up if
// that turns out to matter before launch.
// -----------------------------------------------------------------------------

export type UserSendableMessageType = "text" | "photo" | "location";
export type MessageType = UserSendableMessageType | "system";

export interface MessageWithDetails {
  id: string;
  connectionId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
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
  connectionId: string;
  content: string;
  messageType: UserSendableMessageType;
  // For messageType 'photo': expected shape { url: string }.
  // For messageType 'location': expected shape { lat: number, lng: number }.
  data?: Record<string, unknown>;
}

export interface MessageStats {
  totalMessages: number;
  unreadCount: number;
  messagesByType: Record<string, number>;
  recentMessages: MessageWithDetails[];
}

export class MessageService {
  static async sendMessage(
    messageData: CreateMessageData,
    senderId: string
  ): Promise<ServiceResult<MessageWithDetails>> {
    try {
      const validationError = this.validateMessageData(messageData);
      if (validationError) {
        return { error: validationError };
      }

      const senderIdError = ValidationService.validateUUID(senderId);
      if (senderIdError) {
        return { error: senderIdError };
      }

      const connectionAccess = await this.verifyConnectionAccess(messageData.connectionId, senderId);
      if (connectionAccess.error) {
        return { error: connectionAccess.error };
      }

      const rateLimitCheck = await this.checkRateLimit(senderId);
      if (rateLimitCheck.error) {
        return { error: rateLimitCheck.error };
      }

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .insert([
          {
            connection_id: messageData.connectionId,
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

  static async getConnectionMessages(
    connectionId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ServiceResult<MessageWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(connectionId);
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
        .eq("connection_id", connectionId)
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
        connectionId: message.connection_id,
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

  static async getUnreadMessages(connectionId: string, userId: string): Promise<ServiceResult<MessageWithDetails[]>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      const userIdError = ValidationService.validateUUID(userId);
      if (connectionIdError) return { error: connectionIdError };
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
        .eq("connection_id", connectionId)
        .eq("is_read", false)
        .neq("sender_id", userId)
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
        connectionId: message.connection_id,
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

  static async markMessagesAsRead(
    connectionId: string,
    userId: string,
    messageIds?: string[]
  ): Promise<ServiceResult<boolean>> {
    try {
      const connectionIdError = ValidationService.validateUUID(connectionId);
      const userIdError = ValidationService.validateUUID(userId);
      if (connectionIdError) return { error: connectionIdError };
      if (userIdError) return { error: userIdError };

      let query = supabase
        .from(TABLES.MESSAGES)
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("connection_id", connectionId)
        .eq("is_read", false)
        .neq("sender_id", userId);

      if (messageIds && messageIds.length > 0) {
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
        connectionId: data.connection_id,
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

  static async deleteMessage(messageId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const messageIdError = ValidationService.validateUUID(messageId);
      const userIdError = ValidationService.validateUUID(userId);
      if (messageIdError) return { error: messageIdError };
      if (userIdError) return { error: userIdError };

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

  static async getMessageStats(connectionId: string): Promise<ServiceResult<MessageStats>> {
    try {
      const uuidError = ValidationService.validateUUID(connectionId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.MESSAGES)
        .select("*")
        .eq("connection_id", connectionId)
        .order("created_at", { ascending: false })
        .limit(100);

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
        connectionId: message.connection_id,
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
        .neq("sender_id", userId);

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

  private static validateMessageData(messageData: CreateMessageData): ServiceError | null {
    const connectionIdError = ValidationService.validateUUID(messageData.connectionId);
    if (connectionIdError) return connectionIdError;

    const contentError = ValidationService.validateRequired(messageData.content, "Content");
    if (contentError) return contentError;

    const validTypes: UserSendableMessageType[] = ["text", "photo", "location"];
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

  private static async verifyConnectionAccess(connectionId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const { data: connection, error } = await supabase
        .from(TABLES.CONNECTIONS)
        .select("user_id_1, user_id_2, status")
        .eq("id", connectionId)
        .single();

      if (error || !connection) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: "Connection not found",
          },
        };
      }

      const isUserInConnection = connection.user_id_1 === userId || connection.user_id_2 === userId;
      const isConnectionActive = connection.status === "active";

      if (!isUserInConnection || !isConnectionActive) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "You can only send messages in active connections you participate in",
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
