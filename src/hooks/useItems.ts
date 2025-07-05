import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Item, User } from '../types/database';
import { useAuth } from './useAuth';

export interface ItemWithUser extends Item {
  users: User;
}

// Add caching layer
const itemsCache = new Map<string, { data: ItemWithUser[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useItems = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<ItemWithUser[]>([]);
  const [userItems, setUserItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  // Memoize filtered items to prevent unnecessary re-renders
  const availableItems = useMemo(() => 
    items.filter(item => item.user_id !== user?.id && item.is_active),
    [items, user?.id]
  );

  useEffect(() => {
    if (user) {
      fetchItems();
      fetchUserItems();
    }
  }, [user]);

  const fetchItems = async () => {
    try {
      // Check cache first
      const cacheKey = 'active_items';
      const cached = itemsCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setItems(cached.data);
        setLoading(false);
        return;
      }

      // Optimized query with specific field selection
      const { data, error } = await supabase
        .from('items')
        .select(`
          id,
          title,
          description,
          category,
          condition,
          image_url,
          tags,
          created_at,
          user_id,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating
          )
        `)
        .eq('is_active', true)
        .neq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(50); // Limit initial load

      if (error) throw error;
      
      const itemsData = data as ItemWithUser[];
      setItems(itemsData);
      
      // Cache the results
      itemsCache.set(cacheKey, { data: itemsData, timestamp: Date.now() });
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserItems = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, title, category, condition, image_url, created_at, is_active')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUserItems(data);
    } catch (error) {
      console.error('Error fetching user items:', error);
    }
  };

  const addItem = async (itemData: Omit<Item, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    if (!user) return { error: new Error('No user logged in') };

    const { data, error } = await supabase
      .from('items')
      .insert([
        {
          ...itemData,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (!error) {
      setUserItems(prev => [data, ...prev]);
      // Invalidate cache
      itemsCache.clear();
    }

    return { data, error };
  };

  const updateItem = async (id: string, updates: Partial<Item>) => {
    const { data, error } = await supabase
      .from('items')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (!error) {
      setUserItems(prev => prev.map(item => item.id === id ? data : item));
      // Invalidate cache
      itemsCache.clear();
    }

    return { data, error };
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', id);

    if (!error) {
      setUserItems(prev => prev.filter(item => item.id !== id));
      // Invalidate cache
      itemsCache.clear();
    }

    return { error };
  };

  return {
    items: availableItems,
    userItems,
    loading,
    addItem,
    updateItem,
    deleteItem,
    refetch: fetchItems,
  };
};