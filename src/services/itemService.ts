import { supabase } from "../lib/supabase";
import { ItemData, UserData, ServiceResult, ServiceError, PaginationOptions, FilterOptions } from "./types";
import { APP_CONFIG, ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";

export interface ItemWithUser extends ItemData {
  user: UserData;
}

export class ItemService {
  /**
   * Get items for browsing with pagination and filtering
   */
  static async getItems(
    options: PaginationOptions & FilterOptions & { userId?: string }
  ): Promise<ServiceResult<ItemWithUser[]>> {
    try {
      // Validate pagination parameters
      const paginationError = ValidationService.validatePagination(options.page, options.limit);
      if (paginationError) {
        return { error: paginationError };
      }

      let query = supabase
        .from(TABLES.ITEMS)
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
            rating
          )
        `
        )
        .eq("is_active", true);

      // Apply filters
      if (options.excludeUserId) {
        query = query.neq("user_id", options.excludeUserId);
      }

      if (options.categories && options.categories.length > 0) {
        query = query.in("category", options.categories);
      }

      if (options.conditions && options.conditions.length > 0) {
        query = query.in("condition", options.conditions);
      }

      // Apply advanced filters
      if (options.minValue && options.minValue !== "") {
        query = query.gte("estimated_value", parseFloat(options.minValue));
      }

      if (options.maxValue && options.maxValue !== "") {
        query = query.lte("estimated_value", parseFloat(options.maxValue));
      }

      if (options.maxAge && options.maxAge > 0) {
        const maxAgeDate = new Date();
        maxAgeDate.setDate(maxAgeDate.getDate() - options.maxAge);
        query = query.gte("created_at", maxAgeDate.toISOString());
      }

      if (options.minRating && options.minRating > 0) {
        query = query.gte("users.rating", options.minRating);
      }

      // Apply radius filter if user location is available
      if (options.radius && options.radius > 0) {
        // For now, we'll implement basic radius filtering
        // This would need to be enhanced with proper geospatial queries
        // when user location data is available
        // TODO: Implement proper radius filtering with user location
      }

      // Apply pagination
      const start = options.page * options.limit;
      const end = start + options.limit - 1;
      query = query.order("created_at", { ascending: false }).range(start, end);

      const { data, error } = await query;

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch items",
            details: error,
          },
        };
      }

      // Transform data to match our interface
      const transformedData: ItemWithUser[] = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        condition: item.condition,
        imageUrl: item.image_url,
        tags: item.tags,
        userId: item.user_id,
        isActive: item.is_active,
        price: item.price,
        sourceUrl: item.source_url,
        createdAt: item.created_at,
        user: {
          id: item.users.id,
          username: item.users.username,
          email: "", // Not included in select
          location: item.users.location,
          avatarUrl: item.users.avatar_url,
          role: "", // Not included in select
          rating: item.users.rating,
          totalRatings: 0, // Not included in select
        },
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get items owned by a specific user
   */
  static async getUserItems(userId: string): Promise<ServiceResult<ItemData[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user items",
            details: error,
          },
        };
      }

      const transformedData: ItemData[] = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        condition: item.condition,
        imageUrl: item.image_url,
        tags: item.tags,
        userId: item.user_id,
        isActive: item.is_active,
        price: item.price,
        sourceUrl: item.source_url,
        createdAt: item.created_at,
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get a single item by ID
   */
  static async getItem(itemId: string): Promise<ServiceResult<ItemWithUser>> {
    try {
      const uuidError = ValidationService.validateUUID(itemId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .select(
          `
          *,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating
          )
        `
        )
        .eq("id", itemId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.ITEM_NOT_FOUND,
              message: ERROR_MESSAGES[ERROR_CODES.ITEM_NOT_FOUND],
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch item",
            details: error,
          },
        };
      }

      const transformedData: ItemWithUser = {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        condition: data.condition,
        imageUrl: data.image_url,
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        price: data.price,
        sourceUrl: data.source_url,
        user: {
          id: data.users.id,
          username: data.users.username,
          email: "", // Not included in select
          location: data.users.location,
          avatarUrl: data.users.avatar_url,
          role: "", // Not included in select
          rating: data.users.rating,
          totalRatings: 0, // Not included in select
        },
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Create a new item
   */
  static async createItem(itemData: Omit<ItemData, "id">, userId: string): Promise<ServiceResult<ItemData>> {
    try {
      // Validate input
      const validationError = this.validateItemData(itemData);
      if (validationError) {
        return { error: validationError };
      }

      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .insert([
          {
            title: itemData.title,
            description: itemData.description,
            category: itemData.category,
            condition: itemData.condition,
            image_url: itemData.imageUrl,
            tags: itemData.tags,
            user_id: userId,
            is_active: itemData.isActive,
            price: itemData.price,
            source_url: itemData.sourceUrl,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to create item",
            details: error,
          },
        };
      }

      const transformedData: ItemData = {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        condition: data.condition,
        imageUrl: data.image_url,
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        price: data.price,
        sourceUrl: data.source_url,
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Update an existing item
   */
  static async updateItem(itemId: string, updates: Partial<ItemData>): Promise<ServiceResult<ItemData>> {
    try {
      const uuidError = ValidationService.validateUUID(itemId);
      if (uuidError) {
        return { error: uuidError };
      }

      // Validate updates if provided
      if (updates.title) {
        const titleError = ValidationService.validateItemTitle(updates.title);
        if (titleError) return { error: titleError };
      }

      if (updates.description) {
        const descError = ValidationService.validateItemDescription(updates.description);
        if (descError) return { error: descError };
      }

      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .update({
          title: updates.title,
          description: updates.description,
          category: updates.category,
          condition: updates.condition,
          image_url: updates.imageUrl,
          tags: updates.tags,
          is_active: updates.isActive,
          price: updates.price,
          source_url: updates.sourceUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to update item",
            details: error,
          },
        };
      }

      const transformedData: ItemData = {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        condition: data.condition,
        imageUrl: data.image_url,
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        price: data.price,
        sourceUrl: data.source_url,
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Delete an item
   */
  static async deleteItem(itemId: string): Promise<ServiceResult<boolean>> {
    try {
      const uuidError = ValidationService.validateUUID(itemId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { error } = await supabase.from(TABLES.ITEMS).delete().eq("id", itemId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to delete item",
            details: error,
          },
        };
      }

      return { data: true };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Private helper methods
   */
  private static validateItemData(itemData: Omit<ItemData, "id">): ServiceError | null {
    const titleError = ValidationService.validateItemTitle(itemData.title);
    if (titleError) return titleError;

    const descError = ValidationService.validateItemDescription(itemData.description);
    if (descError) return descError;

    const categoryError = ValidationService.validateRequired(itemData.category, "Category");
    if (categoryError) return categoryError;

    const conditionError = ValidationService.validateRequired(itemData.condition, "Condition");
    if (conditionError) return conditionError;

    return null;
  }
}
