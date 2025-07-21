import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { UserBlock } from '../types/database';

export interface UserBlockWithUser extends UserBlock {
  blocked_user: {
    username: string;
    avatar_url: string | null;
  };
}

export const useUserBlocks = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<UserBlockWithUser[]>([]);

  const blockUser = async (userId: string, reason?: string) => {
    if (!user) return { error: new Error('No user logged in') };

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .insert([
          {
            blocker_id: user.id,
            blocked_id: userId,
            reason,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Refresh blocked users list
      await fetchBlockedUsers();

      return { data, error: null };
    } catch (error) {
      console.error('Error blocking user:', error);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (userId: string) => {
    if (!user) return { error: new Error('No user logged in') };

    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_id', user.id)
        .eq('blocked_id', userId);

      if (error) throw error;

      // Refresh blocked users list
      await fetchBlockedUsers();

      return { error: null };
    } catch (error) {
      console.error('Error unblocking user:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const fetchBlockedUsers = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .select(`
          *,
          blocked_user:users!user_blocks_blocked_id_fkey(username, avatar_url)
        `)
        .eq('blocker_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBlockedUsers(data as UserBlockWithUser[]);
    } catch (error) {
      console.error('Error fetching blocked users:', error);
    } finally {
      setLoading(false);
    }
  };

  const isUserBlocked = async (userId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_id', user.id)
        .eq('blocked_id', userId)
        .single();

      return !error && !!data;
    } catch (error) {
      return false;
    }
  };

  const getBlockedUserIds = async (): Promise<string[]> => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', user.id);

      if (error) throw error;
      return data.map(block => block.blocked_id);
    } catch (error) {
      console.error('Error fetching blocked user IDs:', error);
      return [];
    }
  };

  useEffect(() => {
    if (user) {
      fetchBlockedUsers();
    }
  }, [user]);

  return {
    loading,
    blockedUsers,
    blockUser,
    unblockUser,
    isUserBlocked,
    getBlockedUserIds,
    refetch: fetchBlockedUsers,
  };
};