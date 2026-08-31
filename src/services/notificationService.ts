import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError, NotificationData } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES, BUSINESS_RULES } from "./config";
import { ValidationService } from "./validation";

export interface NotificationWithDetails {
  id: string;
  userId: string;
  type: "match" | "message" | "trade_completed" | "review" | "system" | "item_unavailable" | "review_reminder" | "issue_status" | "admin_daily_summary" | "trade_dispute" | "listing_expiry_reminder" | "pending_approval" | "like" | "admin_item_edit" | "group_invite" | "group_invite_accepted" | "group_invite_declined" | "group_ownership_transferred";
  title: string;
  content: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  readAt?: string;
}

export interface CreateNotificationData {
  userId: string;
  type: "match" | "message" | "trade_completed" | "review" | "system" | "item_unavailable" | "review_reminder" | "issue_status" | "admin_daily_summary" | "trade_dispute" | "listing_expiry_reminder" | "pending_approval" | "like" | "admin_item_edit" | "group_invite" | "group_invite_accepted" | "group_invite_declined" | "group_ownership_transferred";
  title: string;
  content: string;
  data?: Record<string, unknown>;
}

export interface NotificationStats {
  totalNotifications: number;
  unreadCount: number;
  notificationsByType: Record<string, number>;
  recentNotifications: NotificationWithDetails[];
}

export class NotificationService {
  /**
   * Update the current user's own notification preference for a category/channel.
   * Calls update_notification_preference, which validates category/channel
   * server-side and scopes the write to auth.uid() -- no user id passed here.
   */
  static async updateNotificationPreference(
    category: "match" | "message" | "product_update" | "review_reminder" | "onboarding",
    channel: "email",
    enabled: boolean
  ): Promise<ServiceResult<Record<string, Record<string, boolean>>>> {
    try {
      const { data, error } = await supabase.rpc("update_notification_preference", {
        p_category: category,
        p_channel: channel,
        p_enabled: enabled,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to update notification preference",
            details: error,
          },
        };
      }

      if (data?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: data.error,
          },
        };
      }

      return { data: data.notification_preferences };
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
   * Create a new notification
   */
  static async createNotification(
    notificationData: CreateNotificationData
  ): Promise<ServiceResult<NotificationWithDetails>> {
    try {
      // Validate input
      const validationError = this.validateNotificationData(notificationData);
      if (validationError) {
        return { error: validationError };
      }

      // Check notification limit
      const unreadCount = await this.getUnreadCount(notificationData.userId);
      if (unreadCount.data && unreadCount.data >= BUSINESS_RULES.notification.maxUnread) {
        // Mark oldest notifications as read to make room
        await this.markOldestAsRead(notificationData.userId);
      }

      // Create the notification
      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .insert([
          {
            user_id: notificationData.userId,
            type: notificationData.type,
            title: notificationData.title,
            content: notificationData.content,
            data: notificationData.data,
            is_read: false,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to create notification",
            details: error,
          },
        };
      }

      const transformedData: NotificationWithDetails = {
        id: data.id,
        userId: data.user_id,
        type: data.type,
        title: data.title,
        content: data.content,
        data: data.data,
        isRead: data.is_read,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        readAt: data.read_at,
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
   * Get notifications for a user
   */
  static async getUserNotifications(
    userId: string,
    limit: number = 50
  ): Promise<ServiceResult<NotificationWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch notifications",
            details: error,
          },
        };
      }

      const transformedData: NotificationWithDetails[] = data.map((notification: any) => ({
        id: notification.id,
        userId: notification.user_id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        data: notification.data,
        isRead: notification.is_read,
        createdAt: notification.created_at,
        updatedAt: notification.updated_at,
        readAt: notification.read_at,
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
   * Get unread notifications for a user
   */
  static async getUnreadNotifications(
    userId: string,
    limit: number = 20
  ): Promise<ServiceResult<NotificationWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select("*")
        .eq("user_id", userId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch unread notifications",
            details: error,
          },
        };
      }

      const transformedData: NotificationWithDetails[] = data.map((notification: any) => ({
        id: notification.id,
        userId: notification.user_id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        data: notification.data,
        isRead: notification.is_read,
        createdAt: notification.created_at,
        updatedAt: notification.updated_at,
        readAt: notification.read_at,
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
   * Mark a notification as read
   */
  static async markAsRead(notificationId: string): Promise<ServiceResult<boolean>> {
    try {
      const uuidError = ValidationService.validateUUID(notificationId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", notificationId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to mark notification as read",
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
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<ServiceResult<boolean>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to mark all notifications as read",
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
   * Delete a notification
   */
  static async deleteNotification(notificationId: string): Promise<ServiceResult<boolean>> {
    try {
      const uuidError = ValidationService.validateUUID(notificationId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { error } = await supabase.from(TABLES.NOTIFICATIONS).delete().eq("id", notificationId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to delete notification",
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
   * Get notification statistics for a user
   */
  static async getNotificationStats(userId: string): Promise<ServiceResult<NotificationStats>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100); // Get recent notifications for stats

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch notification statistics",
            details: error,
          },
        };
      }

      const totalNotifications = data.length;
      const unreadCount = data.filter((notification) => !notification.is_read).length;

      const notificationsByType = data.reduce((acc, notification) => {
        acc[notification.type] = (acc[notification.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const recentNotifications: NotificationWithDetails[] = data.slice(0, 10).map((notification: any) => ({
        id: notification.id,
        userId: notification.user_id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        data: notification.data,
        isRead: notification.is_read,
        createdAt: notification.created_at,
        updatedAt: notification.updated_at,
        readAt: notification.read_at,
      }));

      return {
        data: {
          totalNotifications,
          unreadCount,
          notificationsByType,
          recentNotifications,
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
   * Get unread count for a user
   */
  static async getUnreadCount(userId: string): Promise<ServiceResult<number>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { count, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to get unread count",
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
   * Clean up old notifications (retention policy)
   */
  static async cleanupOldNotifications(): Promise<ServiceResult<number>> {
    try {
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - BUSINESS_RULES.notification.retentionDays);

      const { data, error } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .delete()
        .lt("created_at", retentionDate.toISOString())
        .select("id");

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to cleanup old notifications",
            details: error,
          },
        };
      }

      return { data: data?.length || 0 };
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
   * Create system notification
   */
  static async createSystemNotification(
    userId: string,
    title: string,
    content: string,
    data?: Record<string, unknown>
  ): Promise<ServiceResult<NotificationWithDetails>> {
    return this.createNotification({
      userId,
      type: "system",
      title,
      content,
      data,
    });
  }

  /**
   * Create match notification
   */
  static async createMatchNotification(
    userId: string,
    matchId: string,
    otherUserUsername: string
  ): Promise<ServiceResult<NotificationWithDetails>> {
    return this.createNotification({
      userId,
      type: "match",
      title: "🎉 New Match!",
      content: `You matched with ${otherUserUsername}! Start chatting to arrange your trade.`,
      data: { matchId, otherUserUsername },
    });
  }

  /**
   * Create message notification
   */
  static async createMessageNotification(
    userId: string,
    matchId: string,
    senderUsername: string,
    messagePreview: string
  ): Promise<ServiceResult<NotificationWithDetails>> {
    return this.createNotification({
      userId,
      type: "message",
      title: `New message from ${senderUsername}`,
      content: messagePreview.length > 50 ? `${messagePreview.substring(0, 50)}...` : messagePreview,
      data: { matchId, senderUsername },
    });
  }

  /**
   * Create trade completed notification
   */
  static async createTradeCompletedNotification(
    userId: string,
    connectionId: string,
    otherUserUsername: string
  ): Promise<ServiceResult<NotificationWithDetails>> {
    return this.createNotification({
      userId,
      type: "trade_completed",
      title: "✅ Trade Completed!",
      content: `Your trade with ${otherUserUsername} has been completed. Don't forget to leave a review!`,
      data: { connectionId, otherUserUsername },
    });
  }

  /**
   * Create review notification
   */
  static async createReviewNotification(
    userId: string,
    reviewerUsername: string,
    rating: number
  ): Promise<ServiceResult<NotificationWithDetails>> {
    return this.createNotification({
      userId,
      type: "review",
      title: `⭐ New Review from ${reviewerUsername}`,
      content: `${reviewerUsername} left you a ${rating}-star review!`,
      data: { reviewerUsername, rating },
    });
  }

  /**
   * Private helper methods
   */
  private static validateNotificationData(notificationData: CreateNotificationData): ServiceError | null {
    const userIdError = ValidationService.validateUUID(notificationData.userId);
    if (userIdError) return userIdError;

    const titleError = ValidationService.validateRequired(notificationData.title, "Title");
    if (titleError) return titleError;

    const contentError = ValidationService.validateRequired(notificationData.content, "Content");
    if (contentError) return contentError;

    const validTypes = [
      "match",
      "message",
      "trade_completed",
      "review",
      "system",
      "item_unavailable",
      "review_reminder",
      "issue_status",
    ];
    if (!validTypes.includes(notificationData.type)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid notification type",
      };
    }

    if (notificationData.title.length > 100) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Notification title is too long",
      };
    }

    if (notificationData.content.length > 500) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Notification content is too long",
      };
    }

    return null;
  }

  private static async markOldestAsRead(userId: string): Promise<void> {
    try {
      const { data: oldestNotifications } = await supabase
        .from(TABLES.NOTIFICATIONS)
        .select("id")
        .eq("user_id", userId)
        .eq("is_read", false)
        .order("created_at", { ascending: true })
        .limit(10); // Mark 10 oldest as read

      if (oldestNotifications && oldestNotifications.length > 0) {
        const notificationIds = oldestNotifications.map((n) => n.id);
        await supabase
          .from(TABLES.NOTIFICATIONS)
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in("id", notificationIds);
      }
    } catch (error) {
      console.error("Failed to mark oldest notifications as read:", error);
    }
  }
}
