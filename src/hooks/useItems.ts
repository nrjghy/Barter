import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ItemService, ItemWithUser } from "../services/itemService";
import { ServiceResult, ItemData } from "../services/types";

/**
 * Items belonging to a given user (any user, not just the current one).
 * Reused for both sides of the Mark Trade Complete item picker: calling
 * this with the current user's own id shares its cache with useItems'
 * own userItems query below (same queryKey shape), and calling it with
 * someone else's id naturally returns just their active items -- items'
 * RLS only lets a non-owner see active rows, which is exactly the
 * right scope for "what could they have traded me."
 */
export const useUserItems = (userId?: string) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["userItems", userId],
    queryFn: () => ItemService.getUserItems(userId!),
    enabled: !!userId,
  });

  return {
    items: data?.data ?? [],
    loading: isLoading,
    error: error?.message,
  };
};

export const useItems = (options?: {
  limit?: number;
  categories?: string[];
  conditions?: string[];
  excludeUserId?: string;
  // Advanced filter options
  radius?: number;
  minValue?: string;
  maxValue?: string;
  maxAge?: number;
  minRating?: number;
  includeUnrated?: boolean;
  // Caller's own location, for the radius filter -- null/undefined skips it
  lat?: number | null;
  lng?: number | null;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    limit = 20,
    categories,
    conditions,
    excludeUserId,
    radius,
    minValue,
    maxValue,
    maxAge,
    minRating,
    includeUnrated,
    lat,
    lng,
  } = options || {};

  // Get items for browsing with infinite pagination
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: [
      "items",
      {
        limit,
        categories,
        conditions,
        excludeUserId,
        radius,
        minValue,
        maxValue,
        maxAge,
        minRating,
        includeUnrated,
        lat,
        lng,
      },
    ],
    queryFn: ({ pageParam = 0 }) =>
      ItemService.getItems({
        page: pageParam as number,
        limit,
        categories,
        conditions,
        excludeUserId,
        radius,
        minValue,
        maxValue,
        maxAge,
        minRating,
        includeUnrated,
        lat,
        lng,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: ServiceResult<ItemWithUser[]>, allPages) => {
      // If we got a full page of results, there might be more
      if (lastPage.data && lastPage.data.length === limit) {
        return allPages.length;
      }
      // No more pages
      return undefined;
    },
    enabled: !!user,
  });

  // Get user's own items
  const {
    data: userItemsData,
    isLoading: userItemsLoading,
    error: userItemsError,
  } = useQuery({
    queryKey: ["userItems", user?.id],
    queryFn: () => ItemService.getUserItems(user!.id),
    enabled: !!user,
  });

  // Get single item by ID
  const getItem = (itemId: string) => {
    return useQuery({
      queryKey: ["item", itemId],
      queryFn: () => ItemService.getItem(itemId),
      enabled: !!itemId,
    });
  };

  // Create item mutation
  const createItem = useMutation({
    mutationFn: (itemData: any) => ItemService.createItem(itemData, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems", user?.id] });
    },
  });

  // Update item mutation
  const updateItem = useMutation({
    mutationFn: ({ itemId, updates }: { itemId: string; updates: any }) =>
      ItemService.updateItem(itemId, updates, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["item"] });
    },
  });

  // Delete item mutation
  const deleteItem = useMutation({
    mutationFn: (itemId: string) => ItemService.deleteItem(itemId),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["item"] });
    },
  });

  // Cancel item mutation (one-way, PRD §2/§13 -- not a generic status setter)
  const cancelItem = useMutation({
    mutationFn: (itemId: string) => ItemService.cancelItem(itemId, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["userItems", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["item"] });
    },
  });

  // Flatten all pages into a single array of items
  const items = data?.pages.flatMap((page) => page.data || []) ?? [];

  return {
    // Browse items with infinite pagination
    items,
    loading: isLoading,
    error: error?.message,
    isFetching: isFetchingNextPage,
    hasMore: hasNextPage,
    loadMoreItems: fetchNextPage,
    loadingMore: isFetchingNextPage,
    refetch,

    // User's own items
    userItems: userItemsData?.data || [],
    userItemsLoading,
    userItemsError: userItemsError?.message,

    // Actions
    createItem: createItem.mutateAsync,
    createItemLoading: createItem.isPending,
    createItemError: createItem.error?.message,

    updateItem: updateItem.mutateAsync,
    updateItemLoading: updateItem.isPending,
    updateItemError: updateItem.error?.message,

    deleteItem: deleteItem.mutate,
    deleteItemLoading: deleteItem.isPending,
    deleteItemError: deleteItem.error?.message,

    cancelItem: cancelItem.mutateAsync,
    cancelItemLoading: cancelItem.isPending,
    cancelItemError: cancelItem.error?.message,

    // Helper function to get single item
    getItem,
  };
};
