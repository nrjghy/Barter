import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ItemService, ItemWithUser } from "../services/itemService";
import { ServiceResult, ItemData } from "../services/types";

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
  } = options || {};

  // Get items for browsing with infinite pagination
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: [
      "items",
      { limit, categories, conditions, excludeUserId, radius, minValue, maxValue, maxAge, minRating },
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
    mutationFn: ({ itemId, updates }: { itemId: string; updates: any }) => ItemService.updateItem(itemId, updates),
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

    updateItem: updateItem.mutate,
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
