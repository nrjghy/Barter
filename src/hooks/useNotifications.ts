import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { Notification } from "../types/database";

const fetchNotifications = async (userId: string) => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Notification[];
};

const markAsReadFn = async (notificationId: string) => {
  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", notificationId);
  if (error) throw error;
  return notificationId;
};

const markAllAsReadFn = async (userId: string) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
  return true;
};

const deleteNotificationFn = async (notificationId: string) => {
  const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
  if (error) throw error;
  return notificationId;
};

export const useNotifications = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => fetchNotifications(user!.id),
    enabled: !!user,
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // Mutations
  const markAsRead = useMutation({
    mutationFn: markAsReadFn,
    onSuccess: (notificationId) => {
      queryClient.setQueryData(["notifications", user?.id], (old: Notification[] = []) =>
        old.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: () => markAllAsReadFn(user!.id),
    onSuccess: () => {
      queryClient.setQueryData(["notifications", user?.id], (old: Notification[] = []) =>
        old.map((n) => ({ ...n, is_read: true }))
      );
    },
  });

  const deleteNotification = useMutation({
    mutationFn: deleteNotificationFn,
    onSuccess: (notificationId) => {
      queryClient.setQueryData(["notifications", user?.id], (old: Notification[] = []) =>
        old.filter((n) => n.id !== notificationId)
      );
    },
  });

  // Real-time subscription for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          queryClient.setQueryData(["notifications", user.id], (old: Notification[] = []) => [newNotification, ...old]);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]); // Only depend on user.id, not queryClient

  return {
    notifications,
    loading,
    unreadCount,
    error,
    markAsRead: (id: string) => markAsRead.mutateAsync(id),
    markAllAsRead: () => markAllAsRead.mutateAsync(),
    deleteNotification: (id: string) => deleteNotification.mutateAsync(id),
    refetch,
  };
};
