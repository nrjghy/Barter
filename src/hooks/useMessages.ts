import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { MessageService } from "../services";
import { trackEvent } from "../lib/analytics";

export const useMessages = (connectionId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get messages for a specific connection
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
  } = useQuery({
    queryKey: ["messages", connectionId],
    queryFn: () => MessageService.getConnectionMessages(connectionId!),
    enabled: !!connectionId && !!user,
    // PRD §5: "fast polling is sufficient -- no full realtime/websocket
    // infrastructure." Only polls while a thread is actually open
    // (queryKey includes connectionId, and React Query only refetches
    // active/mounted queries).
    refetchInterval: 4000,
  });

  // Get unread messages for a specific connection
  const {
    data: unreadMessagesData,
    isLoading: unreadMessagesLoading,
    error: unreadMessagesError,
  } = useQuery({
    queryKey: ["unreadMessages", connectionId, user?.id],
    queryFn: () => MessageService.getUnreadMessages(connectionId!, user!.id),
    enabled: !!connectionId && !!user,
  });

  // Get message statistics for a connection
  const {
    data: messageStatsData,
    isLoading: messageStatsLoading,
    error: messageStatsError,
  } = useQuery({
    queryKey: ["messageStats", connectionId],
    queryFn: () => MessageService.getMessageStats(connectionId!),
    enabled: !!connectionId && !!user,
  });

  // Get unread message count across all connections
  const {
    data: unreadMessageCountData,
    isLoading: unreadMessageCountLoading,
    error: unreadMessageCountError,
  } = useQuery({
    queryKey: ["unreadMessageCount", user?.id],
    queryFn: () => MessageService.getUnreadMessageCount(user!.id),
    enabled: !!user,
  });

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: ({ messageData }: { messageData: any }) => MessageService.sendMessage(messageData, user!.id),
    onSuccess: (_result, variables) => {
      // PRD §17 core conversion funnel, step 5: first message sent. Tracked
      // generically on every send -- PostHog's own funnel analysis already
      // identifies the first occurrence per user/connection in sequence, so
      // no manual "is this actually the first message" check is needed here.
      trackEvent("message_sent", { connectionId: variables.messageData.connectionId });

      // Invalidate related queries
      if (connectionId) {
        queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
        queryClient.invalidateQueries({ queryKey: ["unreadMessages", connectionId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ["messageStats", connectionId] });
      }
      queryClient.invalidateQueries({ queryKey: ["unreadMessageCount", user?.id] });
    },
  });

  // Mark messages as read mutation
  const markMessagesAsRead = useMutation({
    mutationFn: ({ messageIds }: { messageIds?: string[] } = {}) =>
      MessageService.markMessagesAsRead(connectionId!, user!.id, messageIds),
    onSuccess: () => {
      // Invalidate related queries
      if (connectionId) {
        queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
        queryClient.invalidateQueries({ queryKey: ["unreadMessages", connectionId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ["messageStats", connectionId] });
      }
      queryClient.invalidateQueries({ queryKey: ["unreadMessageCount", user?.id] });
    },
  });

  // Delete message mutation
  const deleteMessage = useMutation({
    mutationFn: (messageId: string) => MessageService.deleteMessage(messageId, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      if (connectionId) {
        queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
        queryClient.invalidateQueries({ queryKey: ["unreadMessages", connectionId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ["messageStats", connectionId] });
      }
    },
  });

  return {
    // Messages for current connection
    messages: messagesData?.data || [],
    messagesLoading,
    messagesError: messagesError?.message,

    // Unread messages for current connection
    unreadMessages: unreadMessagesData?.data || [],
    unreadMessagesLoading,
    unreadMessagesError: unreadMessagesError?.message,

    // Message statistics for current connection
    messageStats: messageStatsData?.data,
    messageStatsLoading,
    messageStatsError: messageStatsError?.message,

    // Unread message count across all connections
    unreadMessageCount: unreadMessageCountData?.data || 0,
    unreadMessageCountLoading,
    unreadMessageCountError: unreadMessageCountError?.message,

    // Actions
    sendMessage: sendMessage.mutate,
    sendMessageLoading: sendMessage.isPending,
    sendMessageError: sendMessage.error?.message,

    markMessagesAsRead: markMessagesAsRead.mutate,
    markMessagesAsReadLoading: markMessagesAsRead.isPending,
    markMessagesAsReadError: markMessagesAsRead.error?.message,

    deleteMessage: deleteMessage.mutate,
    deleteMessageLoading: deleteMessage.isPending,
    deleteMessageError: deleteMessage.error?.message,
  };
};
