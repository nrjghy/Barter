import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Item, User } from "../types/database";
import { useAuth } from "../contexts/AuthContext";

export interface ItemWithUser extends Item {
  users: User;
}

const ITEMS_PER_PAGE = 20;

const fetchItems = async ({
  userId,
  role,
  page,
  includeDemoUsers,
}: {
  userId?: string;
  role?: string;
  page: number;
  includeDemoUsers: boolean;
}) => {
  let query = supabase
    .from("items")
    .select(
      `
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
    `
    )
    .eq("is_active", true);

  if (userId) {
    query = query.neq("user_id", userId);
  }
  if (!includeDemoUsers || role !== "admin") {
    query = query.eq("users.is_demo", false);
  }
  query = query.order("created_at", { ascending: false }).range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data as ItemWithUser[];
};

const fetchUserItems = async (userId: string) => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Item[];
};

const addItemFn = async ({
  itemData,
  userId,
}: {
  itemData: Omit<Item, "id" | "user_id" | "created_at" | "updated_at">;
  userId: string;
}) => {
  const { data, error } = await supabase
    .from("items")
    .insert([
      {
        ...itemData,
        user_id: userId,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

const updateItemFn = async ({ id, updates }: { id: string; updates: Partial<Item> }) => {
  const { data, error } = await supabase
    .from("items")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

const deleteItemFn = async (id: string) => {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
  return id;
};

export const useItems = () => {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [includeDemoUsers, setIncludeDemoUsers] = useState(false);
  const queryClient = useQueryClient();

  // Items for browsing
  const {
    data: items = [],
    isLoading: loading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["items", user?.id, user?.role, page, includeDemoUsers],
    queryFn: () => fetchItems({ userId: user?.id, role: user?.role, page, includeDemoUsers }),
    enabled: !!user,
    keepPreviousData: true,
  });

  // User's own items
  const {
    data: userItems = [],
    isLoading: userItemsLoading,
    error: userItemsError,
    refetch: refetchUserItems,
  } = useQuery({
    queryKey: ["userItems", user?.id],
    queryFn: () => fetchUserItems(user!.id),
    enabled: !!user,
  });

  // Mutations
  const addItem = useMutation({
    mutationFn: ({
      itemData,
      userId,
    }: {
      itemData: Omit<Item, "id" | "user_id" | "created_at" | "updated_at">;
      userId: string;
    }) => addItemFn({ itemData, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems"] });
    },
  });

  const updateItem = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Item> }) => updateItemFn({ id, updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => deleteItemFn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems"] });
    },
  });

  // Pagination helpers
  const hasMore = items.length === ITEMS_PER_PAGE && !isFetching;
  const loadMoreItems = () => {
    if (!hasMore || loading || isFetching) return;
    setPage((prev) => prev + 1);
  };

  // Demo user toggle
  const toggleDemoUsers = (include: boolean) => {
    setIncludeDemoUsers(include);
    setPage(0);
    queryClient.invalidateQueries({ queryKey: ["items"] });
  };

  // Filter out current user's items and inactive items
  const availableItems = useMemo(
    () => items.filter((item) => item.user_id !== user?.id && item.is_active),
    [items, user?.id]
  );

  return {
    items: availableItems,
    userItems,
    loading: loading || userItemsLoading,
    error: error || userItemsError,
    hasMore,
    includeDemoUsers,
    toggleDemoUsers,
    loadMoreItems,
    addItem: (itemData: Omit<Item, "id" | "user_id" | "created_at" | "updated_at">) =>
      addItem.mutateAsync({ itemData, userId: user!.id }),
    updateItem: (id: string, updates: Partial<Item>) => updateItem.mutateAsync({ id, updates }),
    deleteItem: (id: string) => deleteItem.mutateAsync(id),
    refetch: () => {
      setPage(0);
      queryClient.invalidateQueries({ queryKey: ["items"] });
      refetchUserItems();
    },
  };
};
