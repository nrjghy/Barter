import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ItemService } from "../services";

export const useItems = (options?: {
  page?: number;
  limit?: number;
  categories?: string[];
  conditions?: string[];
  excludeUserId?: string;
  includeDemoUsers?: boolean;
  role?: string;
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { page = 1, limit = 10, categories, conditions, excludeUserId, includeDemoUsers = false, role } = options || {};

  // Get items for browsing (with pagination and filters)
  const {
    data: itemsData,
    isLoading: itemsLoading,
    error: itemsError,
    isFetching,
  } = useQuery({
    queryKey: ["items", { page, limit, categories, conditions, excludeUserId, includeDemoUsers, role }],
    queryFn: () =>
      ItemService.getItems({
        page,
        limit,
        categories,
        conditions,
        excludeUserId,
        includeDemoUsers,
        role,
      }),
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

  return {
    // Browse items
    items: itemsData?.data || [],
    itemsLoading,
    itemsError: itemsError?.message,
    isFetching,

    // User's own items
    userItems: userItemsData?.data || [],
    userItemsLoading,
    userItemsError: userItemsError?.message,

    // Actions
    createItem: createItem.mutate,
    createItemLoading: createItem.isPending,
    createItemError: createItem.error?.message,

    updateItem: updateItem.mutate,
    updateItemLoading: updateItem.isPending,
    updateItemError: updateItem.error?.message,

    deleteItem: deleteItem.mutate,
    deleteItemLoading: deleteItem.isPending,
    deleteItemError: deleteItem.error?.message,

    // Helper function to get single item
    getItem,
  };
};
