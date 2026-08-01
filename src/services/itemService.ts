import { supabase } from "../lib/supabase";
import { ItemData, UserData, ServiceResult, ServiceError, PaginationOptions, FilterOptions } from "./types";
import { APP_CONFIG, ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";
import { storageService } from "./storageService";

export interface ItemWithUser extends ItemData {
  user: UserData;
}

export class ItemService {
  /**
   * Get items for browsing with pagination and filtering. Calls the
   * get_items_browse RPC rather than a plain client query -- the RPC is
   * also where the is_system/is_demo exclusion and mutual user_blocks
   * enforcement live (see 20260801000007/20260801000009 migrations), so a
   * hand-built query here would silently bypass both.
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

      const { data, error } = await supabase.rpc("get_items_browse", {
        p_lat: options.lat ?? null,
        p_lng: options.lng ?? null,
        p_radius_km: options.radius ?? null,
        p_categories: options.categories ?? null,
        p_conditions: options.conditions ?? null,
        p_exclude_user_id: options.excludeUserId ?? null,
        p_min_value: options.minValue ? parseFloat(options.minValue) : null,
        p_max_value: options.maxValue ? parseFloat(options.maxValue) : null,
        p_max_age_days: options.maxAge ?? null,
        p_min_rating: options.minRating ?? null,
        p_limit: options.limit,
        p_offset: options.page * options.limit,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch items",
            details: error,
          },
        };
      }

      // Transform data to match our interface. The RPC returns flat
      // user_* columns instead of a nested users relation.
      const transformedData: ItemWithUser[] = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        condition: item.condition,
        imageUrls: item.image_urls,
        tags: item.tags,
        userId: item.user_id,
        isActive: item.is_active,
        estimatedValue: item.estimated_value,
        valueCurrency: item.value_currency,
        sourceUrl: item.source_url,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        user: {
          id: item.user_id,
          username: item.user_username,
          email: "", // Not included in the RPC's return columns
          location: item.user_location,
          avatarUrl: item.user_avatar_url,
          role: "", // Not included in the RPC's return columns
          rating: item.user_rating,
          totalRatings: 0, // Not included in the RPC's return columns
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
  static async getUserItems(userId: string): Promise<ServiceResult<ItemWithUser[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
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

      // Transform data to match our interface
      const transformedData: ItemWithUser[] = data.map((item: any) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        category: item.category,
        condition: item.condition,
        imageUrls: item.image_urls, // ✅ Updated to use imageUrls array
        tags: item.tags,
        userId: item.user_id,
        isActive: item.is_active,
        status: item.status,
        // Update to use correct fields:
        estimatedValue: item.estimated_value,
        valueCurrency: item.value_currency,
        sourceUrl: item.source_url,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
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
        imageUrls: data.image_urls, // ✅ Updated to use imageUrls array
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        status: data.status,
        // Update to use correct fields:
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
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
   * Create a new item with image uploads
   * @param itemData - Item data including images
   * @param userId - User ID creating the item
   * @returns Promise<ServiceResult<ItemData>>
   */
  static async createItem(itemData: ItemData, userId: string): Promise<ServiceResult<ItemData>> {
    try {
      // First, create the item without images to get the ID
      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .insert([
          {
            title: itemData.title,
            description: itemData.description,
            category: itemData.category,
            condition: itemData.condition,
            image_urls: [], // Start with empty array
            tags: itemData.tags,
            user_id: userId,
            is_active: itemData.isActive,
            // Update field mappings to match database schema:
            estimated_value: itemData.estimatedValue,
            value_currency: itemData.valueCurrency,
            source_url: itemData.sourceUrl,
            created_at: itemData.createdAt,
            updated_at: itemData.updatedAt,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Failed to create item:", error);
        return { error: { message: error.message, code: error.code } };
      }

      // If there are images to upload, handle them now
      if (itemData.imageUrls && itemData.imageUrls.length > 0) {
        try {
          // Convert base64 previews back to files for upload
          const imageFiles = await ItemService.convertBase64ToFiles(itemData.imageUrls);

          // Upload images to storage
          const uploadedUrls = await storageService.uploadImages(imageFiles, userId, data.id);

          // Update the item with the uploaded image URLs
          const { error: updateError } = await supabase
            .from(TABLES.ITEMS)
            .update({ image_urls: uploadedUrls })
            .eq("id", data.id);

          if (updateError) {
            console.error("Failed to update item with image URLs:", updateError);
            // Continue anyway, item was created successfully
          }
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          // Continue anyway, item was created successfully
        }
      }

      // Transform the created data
      const transformedData: ItemData = {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        condition: data.condition,
        imageUrls: data.image_urls,
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        status: data.status,
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      return { data: transformedData };
    } catch (error) {
      console.error("Unexpected error in createItem:", error);
      return { error: { message: "Failed to create item", code: "UNKNOWN_ERROR" } };
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
          image_urls: updates.imageUrls, // ✅ Updated to use imageUrls array
          tags: updates.tags,
          is_active: updates.isActive,
          // Update to use correct fields:
          estimated_value: updates.estimatedValue,
          value_currency: updates.valueCurrency,
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
        imageUrls: data.image_urls, // ✅ Updated to use imageUrls array
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        status: data.status,
        // Update to use correct fields:
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
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
   * Cancel a listing (one-way for v1, no resume -- PRD §2/§13). Sets both
   * status='cancelled' and is_active=false, keeping the two in sync
   * rather than letting them drift apart. Verifies the requester actually
   * owns the item first, since this is meant to be user-initiated, not a
   * generic status setter.
   */
  static async cancelItem(itemId: string, userId: string): Promise<ServiceResult<ItemData>> {
    try {
      const itemIdError = ValidationService.validateUUID(itemId);
      if (itemIdError) return { error: itemIdError };
      const userIdError = ValidationService.validateUUID(userId);
      if (userIdError) return { error: userIdError };

      const { data: existing, error: fetchError } = await supabase
        .from(TABLES.ITEMS)
        .select("user_id, status")
        .eq("id", itemId)
        .single();

      if (fetchError || !existing) {
        return {
          error: {
            code: ERROR_CODES.ITEM_NOT_FOUND,
            message: ERROR_MESSAGES[ERROR_CODES.ITEM_NOT_FOUND],
          },
        };
      }

      if (existing.user_id !== userId) {
        return {
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "You can only cancel your own listings",
          },
        };
      }

      if (existing.status !== "active") {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Only active listings can be cancelled",
          },
        };
      }

      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .update({ status: "cancelled", is_active: false, updated_at: new Date().toISOString() })
        .eq("id", itemId)
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to cancel listing",
            details: error,
          },
        };
      }

      // Best-effort: the cancel itself is already done at this point, so a
      // failure here shouldn't be surfaced as if the cancel failed -- it
      // would just mean other connections referencing this item don't get
      // notified it's gone. Same pattern as the trade-completed notification
      // in MarkTradeComplete.
      try {
        await supabase.rpc("notify_item_cancelled", { p_item_id: itemId, p_user_id: userId });
      } catch {
        // Swallowed on purpose -- see comment above.
      }

      const transformedData: ItemData = {
        id: data.id,
        title: data.title,
        description: data.description,
        category: data.category,
        condition: data.condition,
        imageUrls: data.image_urls,
        tags: data.tags,
        userId: data.user_id,
        isActive: data.is_active,
        status: data.status,
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
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

  /**
   * Convert base64 image strings back to File objects for upload
   * @param base64Images - Array of base64 image strings
   * @returns Promise<File[]> - Array of File objects
   */
  private static async convertBase64ToFiles(base64Images: string[]): Promise<File[]> {
    return Promise.all(
      base64Images.map(async (base64) => {
        // Remove data URL prefix if present
        const base64Data = base64.includes(",") ? base64.split(",")[1] : base64;

        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);

        // Determine MIME type from base64 data
        const mimeType = ItemService.detectMimeType(base64);
        const extension = ItemService.getExtensionFromMimeType(mimeType);

        const blob = new Blob([byteArray], { type: mimeType });
        const fileName = `item_${Date.now()}_${Math.random().toString(36).substring(2)}.${extension}`;

        return new File([blob], fileName, { type: mimeType });
      })
    );
  }

  /**
   * Detect MIME type from base64 data URL
   * @param base64Data - Base64 data URL
   * @returns string - MIME type
   */
  private static detectMimeType(base64Data: string): string {
    if (base64Data.startsWith("data:image/jpeg")) return "image/jpeg";
    if (base64Data.startsWith("data:image/jpg")) return "image/jpeg";
    if (base64Data.startsWith("data:image/png")) return "image/png";
    if (base64Data.startsWith("data:image/gif")) return "image/gif";
    if (base64Data.startsWith("data:image/webp")) return "image/webp";
    return "image/jpeg"; // Default fallback
  }

  /**
   * Get file extension from MIME type
   * @param mimeType - MIME type
   * @returns string - File extension
   */
  private static getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case "image/jpeg":
        return "jpg";
      case "image/png":
        return "png";
      case "image/gif":
        return "gif";
      case "image/webp":
        return "webp";
      default:
        return "jpg";
    }
  }
}
