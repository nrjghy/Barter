import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Match, Item } from '../types/database';
import { useAuth } from './useAuth';

export interface MatchWithItems extends Match {
  item1: {
    id: string;
    title: string;
    image_url: string | null;
  };
  item2: {
    id: string;
    title: string;
    image_url: string | null;
  };
  user1: {
    username: string;
    avatar_url: string | null;
  };
  user2: {
    username: string;
    avatar_url: string | null;
    id: string;
  };
  user_id_1_offered_items_details: Item[] | null;
  user_id_2_offered_items_details: Item[] | null;
}

export const useMatches = () => {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchMatches();
    }
  }, [user]);

  const fetchMatches = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          item1:item_id_1 (
            id,
            title,
            image_url
          ),
          item2:item_id_2 (
            id,
            title,
            image_url
          ),
          user1:user_id_1 (
            id,
            username,
            avatar_url
          ),
          user2:user_id_2 (
            id,
            username,
            avatar_url
          )
        `)
        .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Fetch offered items details for each match
      console.log('Raw matches data:', data);
      
      const matchesWithOfferedItems = await Promise.all(
        (data as MatchWithItems[]).map(async (match) => {
          let user_id_1_offered_items_details = null;
          let user_id_2_offered_items_details = null;
          
          // Fetch user 1's offered items
          if (match.user_id_1_offered_item_ids && match.user_id_1_offered_item_ids.length > 0) {
            console.log('Fetching user 1 offered items:', match.user_id_1_offered_item_ids);
            const { data: user1Items } = await supabase
              .from('items')
              .select('*')
              .in('id', match.user_id_1_offered_item_ids);
            console.log('User 1 offered items result:', user1Items);
            user_id_1_offered_items_details = user1Items || [];
          }
          
          // Fetch user 2's offered items
          if (match.user_id_2_offered_item_ids && match.user_id_2_offered_item_ids.length > 0) {
            console.log('Fetching user 2 offered items:', match.user_id_2_offered_item_ids);
            const { data: user2Items } = await supabase
              .from('items')
              .select('*')
              .in('id', match.user_id_2_offered_item_ids);
            console.log('User 2 offered items result:', user2Items);
            user_id_2_offered_items_details = user2Items || [];
          }
          
          console.log('Final match with offered items:', {
            matchId: match.id,
            user_id_1_offered_items_details,
            user_id_2_offered_items_details
          });
          
          return {
            ...match,
            user_id_1_offered_items_details,
            user_id_2_offered_items_details
          };
        })
      );
      
      setMatches(matchesWithOfferedItems);
    } catch (error) {
      console.error('Error fetching matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const createMatch = async (
    itemId1: string, 
    itemId2: string, 
    userId1: string, 
    userId2: string,
    user1OfferedItems: string[] | null = null,
    user2OfferedItems: string[] | null = null
  ) => {
    const { data, error } = await supabase
      .from('matches')
      .insert([
        {
          item_id_1: itemId1,
          item_id_2: itemId2,
          user_id_1: userId1,
          user_id_2: userId2,
          status: 'pending',
          user_id_1_offered_item_ids: user1OfferedItems,
          user_id_2_offered_item_ids: user2OfferedItems,
        },
      ])
      .select()
      .single();

    if (!error) {
      await fetchMatches();
    }

    return { data, error };
  };

  const updateMatch = async (matchId: string, status: 'accepted' | 'rejected') => {
    const { data, error } = await supabase
      .from('matches')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', matchId)
      .select()
      .single();

    if (!error) {
      await fetchMatches();
    }

    return { data, error };
  };

  return {
    matches,
    loading,
    createMatch,
    updateMatch,
    refetch: fetchMatches,
  };
};