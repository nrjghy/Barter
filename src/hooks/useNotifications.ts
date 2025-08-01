import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { NotificationService } from "../services";

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get user notifications
  const {
    data: notificationsData,
    isLoading: notificationsLoading,
    error: notificationsError,
  } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => NotificationService.getUserNotifications(user!.id),
    enabled: !!user,
  });

  // Get unread notifications
  const {
    data: unreadNotificationsData,
    isLoading: unreadNotificationsLoading,
    error: unreadNotificationsError,
  } = useQuery({
    queryKey: ["unreadNotifications", user?.id],
    queryFn: () => NotificationService.getUnreadNotifications(user!.id),
    enabled: !!user,
  });

  // Get notification statistics
  const {
    data: notificationStatsData,
    isLoading: notificationStatsLoading,
    error: notificationStatsError,
  } = useQuery({
    queryKey: ["notificationStats", user?.id],
    queryFn: () => NotificationService.getNotificationStats(user!.id),
    enabled: !!user,
  });

  // Get unread count
  const {
    data: unreadCountData,
    isLoading: unreadCountLoading,
    error: unreadCountError,
  } = useQuery({
    queryKey: ["unreadCount", user?.id],
    queryFn: () => NotificationService.getUnreadCount(user!.id),
    enabled: !!user,
  });

  // Mark notification as read
  const markAsRead = useMutation({
    mutationFn: (notificationId: string) => NotificationService.markAsRead(notificationId),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notificationStats", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount", user?.id] });
    },
  });

  // Mark all notifications as read
  const markAllAsRead = useMutation({
    mutationFn: () => NotificationService.markAllAsRead(user!.id),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notificationStats", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount", user?.id] });
    },
  });

  // Delete notification
  const deleteNotification = useMutation({
    mutationFn: (notificationId: string) => NotificationService.deleteNotification(notificationId),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notificationStats", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount", user?.id] });
    },
  });

  // Create notification (for internal use)
  const createNotification = useMutation({
    mutationFn: (notificationData: any) => NotificationService.createNotification(notificationData),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadNotifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notificationStats", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["unreadCount", user?.id] });
    },
  });

  return {
    // All notifications
    notifications: notificationsData?.data || [],
    notificationsLoading,
    notificationsError: notificationsError?.message,

    // Unread notifications
    unreadNotifications: unreadNotificationsData?.data || [],
    unreadNotificationsLoading,
    unreadNotificationsError: unreadNotificationsError?.message,

    // Notification statistics
    notificationStats: notificationStatsData?.data,
    notificationStatsLoading,
    notificationStatsError: notificationStatsError?.message,

    // Unread count
    unreadCount: unreadCountData?.data || 0,
    unreadCountLoading,
    unreadCountError: unreadCountError?.message,

    // Actions
    markAsRead: markAsRead.mutate,
    markAsReadLoading: markAsRead.isPending,
    markAsReadError: markAsRead.error?.message,

    markAllAsRead: markAllAsRead.mutate,
    markAllAsReadLoading: markAllAsRead.isPending,
    markAllAsReadError: markAllAsRead.error?.message,

    deleteNotification: deleteNotification.mutate,
    deleteNotificationLoading: deleteNotification.isPending,
    deleteNotificationError: deleteNotification.error?.message,

    createNotification: createNotification.mutate,
    createNotificationLoading: createNotification.isPending,
    createNotificationError: createNotification.error?.message,
  };
};
