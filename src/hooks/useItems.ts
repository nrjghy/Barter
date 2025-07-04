import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Item, User } from '../types/database';
import { useAuth } from './useAuth';

export interface ItemWithUser extends Item {
  users: User;
}

export const useItems = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<ItemWithUser[]>([]);
  const [userItems, setUserItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchItems();
      fetchUserItems();
    }
  }, [user]);

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          users (*)
        `)
        .eq('is_active', true)
        .neq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data as ItemWithUser[]);
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
    }

    return { error };
  };

  return {
    items,
    userItems,
    loading,
    addItem,
    updateItem,
    deleteItem,
    refetch: fetchItems,
  };
};