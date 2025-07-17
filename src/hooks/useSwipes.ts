import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import toast from 'react-hot-toast';

export interface SwipeData {
  user_id: string;
  item_id: string;
  direction: 'left' | 'right' | 'super';
}

export const useSwipes = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [dailySwipeCount, setDailySwipeCount] = useState(0);
  const [swipeLimit] = useState(50);

  const checkSwipeLimit = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data, error } = await supabase.rpc('can_user_swipe', {
        user_uuid: user.id
      });

      if (error) throw error;
      
      // Get current swipe count
      const { data: userData } = await supabase
        .from('users')
        .select('daily_swipes')
        .eq('id', user.id)
        .single();

      if (userData) {
        setDailySwipeCount(userData.daily_swipes);
      }

      return data;
    } catch (error) {
      console.error('Error checking swipe limit:', error);
      return false;
    }
  }, [user]);

  const recordSwipe = useCallback(async (itemId: string, direction: 'left' | 'right' | 'super') => {
  }
  )
  const recordSwipe = useCallback(async (itemId: string, direction: 'left' | 'right' | 'super', offeredItemIds: string[] | null = null) => {
    if (!user) return { error: new Error('No user logged in') };

    setLoading(true);
    try {
      // Check if user can swipe
      const canSwipe = await checkSwipeLimit();
      if (!canSwipe) {
        toast.error('Daily swipe limit reached! Come back tomorrow.');
        return { error: new Error('Daily swipe limit reached') };
      }

      // Record the swipe
      const { error: swipeError } = await supabase
        .from('swipes')
        .insert([{
          user_id: user.id,
          item_id: itemId,
          direction,
          offered_item_ids: offeredItemIds
        }]);

      if (swipeError) {
        // If it's a duplicate, that's okay - user already swiped on this item
        if (!swipeError.message.includes('duplicate')) {
          throw swipeError;
        }
      }

      // Increment swipe count
      await supabase.rpc('increment_swipe_count', {
        user_uuid: user.id
      });

      // Update local count
      setDailySwipeCount(prev => prev + 1);

      // If it's a right swipe or super like, check for matches
      if (direction === 'right' || direction === 'super') {
        await checkForMatch(itemId, direction === 'super', offeredItemIds);
      }

      return { error: null };
    } catch (error) {
      console.error('Error recording swipe:', error);
      return { error };
    } finally {
      setLoading(false);
    }
  }, [user, checkSwipeLimit]);

  const checkForMatch = async (itemId: string, isSuperLike: boolean = false, currentUserOfferedItems: string[] | null = null) => {
    if (!user) return;

    try {
      // Get the item details
      const { data: item, error: itemError } = await supabase
        .from('items')
        .select('user_id, title')
        .eq('id', itemId)
        .single();

      if (itemError || !item) return;

      // Check if the other user has swiped right on any of our items
      const { data: userItems } = await supabase
        .from('items')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (!userItems || userItems.length === 0) return;

      const userItemIds = userItems.map(item => item.id);

      // Check if other user swiped right on any of our items
      const { data: mutualSwipes } = await supabase
        .from('swipes')
        .select('item_id, offered_item_ids')
        .eq('user_id', item.user_id)
        .in('item_id', userItemIds)
        .in('direction', ['right', 'super']);

      if (mutualSwipes && mutualSwipes.length > 0) {
        const otherUserSwipe = mutualSwipes[0];
        
        // Create a match!
        const { error: matchError } = await supabase
          .from('matches')
          .insert([{
            item_id_1: otherUserSwipe.item_id,
            item_id_2: itemId,
            user_id_1: user.id,
            user_id_2: item.user_id,
            is_super_like: isSuperLike,
            status: 'pending',
            user_id_1_offered_item_ids: otherUserSwipe.offered_item_ids,
            user_id_2_offered_item_ids: currentUserOfferedItems
          }]);

        if (!matchError) {
          toast.success(`🎉 It's a match! You both liked each other's items!`);
        }
      }
    } catch (error) {
      console.error('Error checking for match:', error);
    }
  };

  const getSwipedItems = useCallback(async (): Promise<string[]> => {
    if (!user) return [];

    try {
      const { data, error } = await supabase
        .from('swipes')
        .select('item_id')
        .eq('user_id', user.id);

      if (error) throw error;
      return data.map(swipe => swipe.item_id);
    } catch (error) {
      console.error('Error fetching swiped items:', error);
      return [];
    }
  }, [user]);

  return {
    loading,
    dailySwipeCount,
    swipeLimit,
    recordSwipe,
    checkSwipeLimit,
    getSwipedItems,
  };
};