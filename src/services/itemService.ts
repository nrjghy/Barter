import { supabase } from "../lib/supabase";
import { ItemData, UserData, ServiceResult, ServiceError, PaginationOptions, FilterOptions } from "./types";
import { APP_CONFIG, ERROR_CODES, ERROR_MESSAGES, GROUPS_ENABLED, TABLES } from "./config";
import { ValidationService } from "./validation";
import { storageService } from "./storageService";

export interface ItemWithUser extends ItemData {
  user: UserData;
  // Only populated by getItems (backed by get_items_browse, which selects
  // u.is_curator) -- getUserItems/getItem don't query it, so it's absent
  // there rather than a misleading false.
  userIsCurator?: boolean;
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
        p_include_unrated: options.includeUnrated ?? true,
        // Omitted entirely (not sent as null) when GROUPS_ENABLED is false --
        // PostgREST does exact signature matching, and Barter2's current
        // get_items_browse doesn't have this parameter at all, so sending it
        // even as null fails the whole call.
        ...(GROUPS_ENABLED ? { p_group_ids: options.groupIds ?? null } : {}),
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
        listingType: item.listing_type,
        estimatedValue: item.estimated_value,
        valueCurrency: item.value_currency,
        sourceUrl: item.source_url,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        userIsCurator: item.user_is_curator,
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

      // Assigned to a `string`-typed variable, then passed by reference --
      // a template literal expression passed directly as a .select() argument
      // gets inferred as a template *literal type* rather than widened to
      // plain `string`, which supabase-js's typed select parser then chokes
      // on for the GROUPS_ENABLED-gated fragment. Routing through a
      // variable forces the widening.
      const userItemsSelectQuery: string = `
          *,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating
          )${GROUPS_ENABLED ? ", item_groups ( groups ( name ) )" : ""}
        `;
      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .select(userItemsSelectQuery)
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
        listingType: item.listing_type,
        // Update to use correct fields:
        estimatedValue: item.estimated_value,
        valueCurrency: item.value_currency,
        sourceUrl: item.source_url,
        categorySuggestion: item.category_suggestion,
        isPublic: item.is_public,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        ...(GROUPS_ENABLED
          ? { groupNames: (item.item_groups ?? []).map((ig: any) => ig.groups?.name).filter(Boolean) }
          : {}),
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

      // Assigned to a `string`-typed variable, then passed by reference --
      // a template literal expression passed directly as a .select() argument
      // gets inferred as a template *literal type* (preserving each
      // interpolation's own type) rather than widened to plain `string`, so
      // supabase-js's typed select parser still chokes on the
      // GROUPS_ENABLED-gated fragment even though the fragment itself is
      // string-typed. Routing through a variable forces the widening.
      const itemSelectQuery: string = `
          *,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating,
            created_at
          )${GROUPS_ENABLED ? ", item_groups ( groups ( name ) )" : ""}
        `;
      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .select(itemSelectQuery)
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

      // Routing the select through a variable (see itemSelectQuery above)
      // widens supabase-js's inferred row type to GenericStringError instead
      // of the usual literal-parsed shape -- cast to any here, same idiom
      // already used for getUserItems' row mapping below.
      const record = data as any;

      const transformedData: ItemWithUser = {
        id: record.id,
        title: record.title,
        description: record.description,
        category: record.category,
        condition: record.condition,
        imageUrls: record.image_urls, // ✅ Updated to use imageUrls array
        tags: record.tags,
        userId: record.user_id,
        isActive: record.is_active,
        status: record.status,
        listingType: record.listing_type,
        // Update to use correct fields:
        estimatedValue: record.estimated_value,
        valueCurrency: record.value_currency,
        sourceUrl: record.source_url,
        categorySuggestion: record.category_suggestion,
        isPublic: record.is_public,
        latitude: record.latitude,
        longitude: record.longitude,
        location: record.location,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        ...(GROUPS_ENABLED
          ? { groupNames: (record.item_groups ?? []).map((ig: any) => ig.groups?.name).filter(Boolean) }
          : {}),
        user: {
          id: record.users.id,
          username: record.users.username,
          email: "", // Not included in select
          location: record.users.location,
          avatarUrl: record.users.avatar_url,
          role: "", // Not included in select
          rating: record.users.rating,
          totalRatings: 0, // Not included in select
          createdAt: record.users.created_at,
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
      // First, create the item without images to get the ID. is_public is
      // only included when GROUPS_ENABLED -- Barter2's items table doesn't
      // have that column yet, and sending it breaks the insert entirely.
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
            listing_type: itemData.listingType,
            // Update field mappings to match database schema:
            estimated_value: itemData.estimatedValue,
            value_currency: itemData.valueCurrency,
            source_url: itemData.sourceUrl,
            category_suggestion: itemData.categorySuggestion,
            ...(GROUPS_ENABLED ? { is_public: itemData.isPublic ?? true } : {}),
            latitude: itemData.latitude,
            longitude: itemData.longitude,
            location: itemData.location,
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

      // If there are images to upload, handle them now. itemData.imageUrls may
      // be a mix of already-uploaded storage URLs (carried over via Relist --
      // see MyStuff.tsx) and fresh base64 previews. Only the base64 portion
      // needs uploading; already-real URLs pass through unchanged. Mirrors the
      // identical distinction updateItem already makes -- before Relist
      // existed, create-mode images were always 100% fresh base64, so this
      // split was never needed here until now.
      if (itemData.imageUrls && itemData.imageUrls.length > 0) {
        const finalImageUrls = await ItemService.resolveImageUrls(itemData.imageUrls, userId, data.id);

        const { error: updateError } = await supabase
          .from(TABLES.ITEMS)
          .update({ image_urls: finalImageUrls })
          .eq("id", data.id);

        if (updateError) {
          console.error("Failed to update item with image URLs:", updateError);
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
        listingType: data.listing_type,
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        categorySuggestion: data.category_suggestion,
        isPublic: data.is_public,
        latitude: data.latitude,
        longitude: data.longitude,
        location: data.location,
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
  static async updateItem(
    itemId: string,
    updates: Partial<ItemData>,
    userId: string
  ): Promise<ServiceResult<ItemData>> {
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

      // updates.imageUrls may be a mix of already-uploaded storage URLs (images the
      // user kept from before) and new base64 previews (freshly picked files), since
      // the edit form pre-fills existing images and only generates base64 previews for
      // ones added during this session. Unlike createItem, this method previously wrote
      // that array straight through -- any base64 entries would have been persisted as
      // raw data URIs in image_urls instead of real storage URLs. Only the base64
      // portion needs uploading; already-real URLs pass through unchanged.
      const finalImageUrls = await ItemService.resolveImageUrls(updates.imageUrls, userId, itemId);

      const { data, error } = await supabase
        .from(TABLES.ITEMS)
        .update({
          title: updates.title,
          description: updates.description,
          category: updates.category,
          condition: updates.condition,
          image_urls: finalImageUrls, // ✅ Updated to use imageUrls array
          tags: updates.tags,
          is_active: updates.isActive,
          listing_type: updates.listingType,
          // Update to use correct fields:
          estimated_value: updates.estimatedValue,
          value_currency: updates.valueCurrency,
          source_url: updates.sourceUrl,
          category_suggestion: updates.categorySuggestion, // was previously dropped entirely
          ...(GROUPS_ENABLED ? { is_public: updates.isPublic } : {}),
          latitude: updates.latitude,
          longitude: updates.longitude,
          location: updates.location,
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
        listingType: data.listing_type,
        // Update to use correct fields:
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        categorySuggestion: data.category_suggestion,
        isPublic: data.is_public,
        latitude: data.latitude,
        longitude: data.longitude,
        location: data.location,
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
   * Admin editing another user's listing -- covers every field the owner
   * themselves can edit via AddEditItem.tsx, except listing_type (locked
   * post-creation for admins too, same as for owners). Goes through
   * admin_update_item rather than a plain client update: that RPC is
   * admin-gated, diffs old vs. new server-side, and notifies the owner with
   * the actual diff (skipped entirely if nothing changed, or if the admin is
   * editing their own listing). Runs the same image-upload preprocessing as
   * updateItem before calling it, since Storage uploads are a client-side
   * concern that can't move into SQL.
   */
  static async adminUpdateItem(
    itemId: string,
    updates: Partial<ItemData>,
    adminUserId: string
  ): Promise<ServiceResult<boolean>> {
    try {
      const uuidError = ValidationService.validateUUID(itemId);
      if (uuidError) return { error: uuidError };

      const finalImageUrls = await ItemService.resolveImageUrls(updates.imageUrls, adminUserId, itemId);

      const { data: result, error } = await supabase.rpc("admin_update_item", {
        target_item_id: itemId,
        p_title: updates.title ?? null,
        p_description: updates.description ?? null,
        p_category: updates.category ?? null,
        p_category_suggestion: updates.categorySuggestion ?? null,
        p_condition: updates.condition ?? null,
        p_estimated_value: updates.estimatedValue ?? null,
        p_value_currency: updates.valueCurrency ?? null,
        p_tags: updates.tags ?? null,
        p_image_urls: finalImageUrls ?? null,
        p_location: updates.location ?? null,
        p_latitude: updates.latitude ?? null,
        p_longitude: updates.longitude ?? null,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to update item",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
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
   * Confirms a listing is still available, in response to the "still have
   * this?" inactivity reminder (PRD §2). Has to be an RPC, not a plain
   * client update: confirm_listing_still_available is owner-only,
   * active-status-only, and just touches updated_at rather than clearing
   * inactivity_reminder_sent_at -- send_inactivity_reminders/
   * archive_inactive_listings (daily cron) both key their eligibility off
   * updated_at vs. inactivity_reminder_sent_at, so this is enough to pull
   * the listing out of the current grace-period countdown.
   *
   * Same two-layer error convention as completeTrade/fileDispute.
   */
  static async confirmStillAvailable(itemId: string): Promise<ServiceResult<{ itemId: string; confirmedAt: string }>> {
    try {
      const itemIdError = ValidationService.validateUUID(itemId);
      if (itemIdError) return { error: itemIdError };

      const { data: result, error } = await supabase.rpc("confirm_listing_still_available", {
        p_item_id: itemId,
      });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to confirm listing",
            details: error,
          },
        };
      }

      if (result?.error) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: result.error,
          },
        };
      }

      return {
        data: {
          itemId: result.itemId,
          confirmedAt: result.confirmedAt,
        },
      };
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
        listingType: data.listing_type,
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
   * Resolves a listing's imageUrls array to real Storage URLs. Entries may be
   * a mix of already-uploaded storage URLs (kept from before) and fresh
   * base64 previews (data: URIs) -- only the base64 portion needs uploading,
   * already-real URLs pass through unchanged. Shared by createItem,
   * updateItem, and adminUpdateItem so this logic exists exactly once; a
   * failed upload falls back to just the already-real URLs rather than
   * persisting unresolved base64 data or losing the whole batch.
   */
  private static async resolveImageUrls(
    imageUrls: string[] | undefined,
    userId: string,
    itemId: string
  ): Promise<string[] | undefined> {
    if (!imageUrls || imageUrls.length === 0) return imageUrls;

    const alreadyUploadedUrls = imageUrls.filter((url) => !url.startsWith("data:"));
    const newBase64Images = imageUrls.filter((url) => url.startsWith("data:"));

    if (newBase64Images.length === 0) return alreadyUploadedUrls;

    try {
      const imageFiles = await ItemService.convertBase64ToFiles(newBase64Images);
      const uploadedUrls = await storageService.uploadImages(imageFiles, userId, itemId);
      return [...alreadyUploadedUrls, ...uploadedUrls];
    } catch (uploadError) {
      console.error("Image upload failed:", uploadError);
      return alreadyUploadedUrls;
    }
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
