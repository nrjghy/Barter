import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Item, User } from '../types/database';
import { useAuth } from './useAuth';

export interface ItemWithUser extends Item {
  users: User;
}

// Add caching layer
const itemsCache = new Map<string, { data: ItemWithUser[]; timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes (shorter for testing)

export const useItems = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<ItemWithUser[]>([]);
  const [userItems, setUserItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [includeDemoUsers, setIncludeDemoUsers] = useState(false);
  const ITEMS_PER_PAGE = 20;

  // Memoize filtered items to prevent unnecessary re-renders
  const availableItems = useMemo(() => 
    items.filter(item => item.user_id !== user?.id && item.is_active),
    [items, user?.id]
  );

  useEffect(() => {
    if (user) {
      console.log('User authenticated, fetching items for:', user.id);
      fetchItems();
      fetchUserItems();
    } else {
      console.log('No user found, skipping item fetch');
      setLoading(false);
    }
  }, [user, includeDemoUsers]);

  const fetchItems = async (page: number = 0, append: boolean = false, includeDemo: boolean = includeDemoUsers) => {
    if (!append) setLoading(true);
    setError(null);
    
    try {
      console.log('Fetching items for user:', user?.id);
      
      // Check cache first
      const cacheKey = `active_items_page_${page}_demo_${includeDemo}`;
      const cached = itemsCache.get(cacheKey);
      
      if (page === 0 && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setItems(append ? [...items, ...cached.data] : cached.data);
        setLoading(false);
        return;
      }

      // Build query with demo user filtering
      let query = supabase
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
          updated_at,
          user_id,
          is_active,
          price,
          source_url,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating,
            is_demo
          )
        `)
        .eq('is_active', true);

      // Only filter by user_id if user is logged in
      if (user?.id) {
        query = query.neq('user_id', user.id);
      }

      // Apply demo filter - only show demo users if explicitly requested AND user is admin
      if (!includeDemo || (user?.role !== 'admin')) {
        query = query.eq('users.is_demo', false);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      const { data, error } = await query;

      if (error) throw error;
      
      console.log('Raw items fetched:', data?.length || 0);
      console.log('Sample item:', data?.[0]);
      
      const itemsData = data as ItemWithUser[];
      
      // Check if we have more items
      setHasMore(itemsData.length === ITEMS_PER_PAGE);
      
      if (append) {
        setItems(prev => [...prev, ...itemsData]);
      } else {
        setItems(itemsData);
      }
      
      // Cache the results
      if (page === 0) {
        itemsCache.set(cacheKey, { data: itemsData, timestamp: Date.now() });
      }
      
      console.log('Items set in state:', itemsData.length);
    } catch (error) {
      console.error('Error fetching items:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch items');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreItems = async () => {
    if (!hasMore || loading) return;
    
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await fetchItems(nextPage, true, includeDemoUsers);
  };
  const fetchUserItems = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
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
      // Refresh items to show new item from other users
      if (data.user_id !== user.id) {
        fetchItems(0, false, includeDemoUsers);
      }
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

  const toggleDemoUsers = (include: boolean) => {
    setIncludeDemoUsers(include);
    setCurrentPage(0);
    // Clear cache when toggling demo filter
    itemsCache.clear();
  };
  return {
    items: availableItems,
    userItems,
    loading,
    error,
    hasMore,
    includeDemoUsers,
    toggleDemoUsers,
    loadMoreItems,
    addItem,
    updateItem,
    deleteItem,
    refetch: () => {
      setCurrentPage(0);
      fetchItems(0, false, includeDemoUsers);
    },
  };
};