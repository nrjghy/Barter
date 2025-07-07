import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Message {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'image' | 'template';
  is_read: boolean;
  created_at: string;
}

export interface MessageWithSender extends Message {
  sender: {
    username: string;
    avatar_url?: string;
  };
}

export const QUICK_RESPONSES = [
  "Hi! I'm interested in your item 👋",
  "Is this still available?",
  "Would you like to trade?",
  "Can we meet up to exchange?",
  "Thanks for the trade! 🙏",
  "Great doing business with you!",
];

export const useMessages = (matchId?: string) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!matchId || !user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:users!messages_sender_id_fkey (
            username,
            avatar_url
          )
        `)
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data as MessageWithSender[]);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [matchId, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    if (!matchId) return;

    // Subscribe to new messages
    const subscription = supabase
      .channel(`messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          // Fetch the complete message with sender info
          supabase
            .from('messages')
            .select(`
              *,
              sender:users!messages_sender_id_fkey (
                username,
                avatar_url
              )
            `)
            .eq('id', payload.new.id)
            .single()
            .then(({ data }) => {
              if (data) {
                setMessages(prev => [...prev, data as MessageWithSender]);
              }
            });
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [matchId]);

  const sendMessage = async (content: string, messageType: 'text' | 'template' = 'text') => {
    if (!user || !matchId || !content.trim()) return { error: new Error('Invalid message data') };

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([{
          match_id: matchId,
          sender_id: user.id,
          content: content.trim(),
          message_type: messageType,
        }])
        .select()
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Error sending message:', error);
      return { data: null, error };
    }
  };

  const markAsRead = async (messageId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('id', messageId)
        .eq('sender_id', user?.id, { negate: true }); // Only mark as read if not sender

      if (error) throw error;
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  return {
    messages,
    loading,
    sendMessage,
    markAsRead,
    refetch: fetchMessages,
  };
};