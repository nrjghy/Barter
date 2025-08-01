import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { MessageService } from "../services";

export const useMessages = (matchId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get messages for a specific match
  const {
    data: messagesData,
    isLoading: messagesLoading,
    error: messagesError,
  } = useQuery({
    queryKey: ["messages", matchId],
    queryFn: () => MessageService.getMatchMessages(matchId!),
    enabled: !!matchId && !!user,
  });

  // Get unread messages for a specific match
  const {
    data: unreadMessagesData,
    isLoading: unreadMessagesLoading,
    error: unreadMessagesError,
  } = useQuery({
    queryKey: ["unreadMessages", matchId, user?.id],
    queryFn: () => MessageService.getUnreadMessages(matchId!, user!.id),
    enabled: !!matchId && !!user,
  });

  // Get message statistics for a match
  const {
    data: messageStatsData,
    isLoading: messageStatsLoading,
    error: messageStatsError,
  } = useQuery({
    queryKey: ["messageStats", matchId],
    queryFn: () => MessageService.getMessageStats(matchId!),
    enabled: !!matchId && !!user,
  });

  // Get unread message count across all matches
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
    onSuccess: () => {
      // Invalidate related queries
      if (matchId) {
        queryClient.invalidateQueries({ queryKey: ["messages", matchId] });
        queryClient.invalidateQueries({ queryKey: ["unreadMessages", matchId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ["messageStats", matchId] });
      }
      queryClient.invalidateQueries({ queryKey: ["unreadMessageCount", user?.id] });
    },
  });

  // Mark messages as read mutation
  const markMessagesAsRead = useMutation({
    mutationFn: ({ messageIds }: { messageIds?: string[] } = {}) =>
      MessageService.markMessagesAsRead(matchId!, user!.id, messageIds),
    onSuccess: () => {
      // Invalidate related queries
      if (matchId) {
        queryClient.invalidateQueries({ queryKey: ["messages", matchId] });
        queryClient.invalidateQueries({ queryKey: ["unreadMessages", matchId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ["messageStats", matchId] });
      }
      queryClient.invalidateQueries({ queryKey: ["unreadMessageCount", user?.id] });
    },
  });

  // Delete message mutation
  const deleteMessage = useMutation({
    mutationFn: (messageId: string) => MessageService.deleteMessage(messageId, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      if (matchId) {
        queryClient.invalidateQueries({ queryKey: ["messages", matchId] });
        queryClient.invalidateQueries({ queryKey: ["unreadMessages", matchId, user?.id] });
        queryClient.invalidateQueries({ queryKey: ["messageStats", matchId] });
      }
    },
  });

  return {
    // Messages for current match
    messages: messagesData?.data || [],
    messagesLoading,
    messagesError: messagesError?.message,

    // Unread messages for current match
    unreadMessages: unreadMessagesData?.data || [],
    unreadMessagesLoading,
    unreadMessagesError: unreadMessagesError?.message,

    // Message statistics for current match
    messageStats: messageStatsData?.data,
    messageStatsLoading,
    messageStatsError: messageStatsError?.message,

    // Unread message count across all matches
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
