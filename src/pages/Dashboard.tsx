import React, { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { CategoryFilter } from "../components/CategoryFilter";
import { DashboardHeader } from "../components/DashboardHeader";
import { SwipeInterface } from "../components/SwipeInterface";
import { SwipeControls } from "../components/SwipeControls";
import { ItemStatus } from "../components/ItemStatus";
import { LocationPrompt } from "../components/LocationPrompt";
import { useItems } from "../hooks/useItems";
import { useResponses } from "../hooks/useResponses";
import { useAuth } from "../hooks/useAuth";
import toast from "react-hot-toast";
import { trackEvent } from "../lib/analytics";
import { ERROR_CODES, ERROR_MESSAGES } from "../services/config";

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [respondedItems, setRespondedItems] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);

  // PRD §17 core conversion funnel, step 1: Discover landing.
  useEffect(() => {
    trackEvent("discover_viewed");
  }, []);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  // Advanced filter states
  const [radius, setRadius] = useState(50);
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [maxAge, setMaxAge] = useState(30);
  const [minRating, setMinRating] = useState(3.0);

  const { items, loading, error, hasMore, loadMoreItems, refetch, loadingMore } = useItems({
    categories: selectedCategories.length > 0 ? selectedCategories : undefined,
    conditions: selectedConditions.length > 0 ? selectedConditions : undefined,
    radius: radius !== 50 ? radius : undefined,
    minValue: minValue !== "" ? minValue : undefined,
    maxValue: maxValue !== "" ? maxValue : undefined,
    maxAge: maxAge !== 30 ? maxAge : undefined,
    minRating: minRating !== 3.0 ? minRating : undefined,
    excludeUserId: user?.id, // ✅ Exclude current user's own items
    // New account / location never set -> both null, get_items_browse skips
    // the radius bounds check entirely rather than erroring.
    lat: user?.latitude ?? null,
    lng: user?.longitude ?? null,
  });
  const { recordResponse, dailyLikeCount, likeLimit, getRespondedItems, undoResponse } = useResponses();

  // Load previously responded-to items
  useEffect(() => {
    const loadRespondedItems = async () => {
      const responded = await getRespondedItems();
      setRespondedItems(new Set(responded));
    };

    if (user) {
      loadRespondedItems();
    }
  }, [user]); // Remove getRespondedItems from dependencies

  useEffect(() => {
    if (user && user.latitude == null && !user.locationPromptDismissedAt) {
      setShowLocationPrompt(true);
    }
  }, [user]);

  // Filter items based on responded items - use more efficient filtering
  const availableItems = React.useMemo(() => {
    // Early return if no items to filter
    if (items.length === 0) {
      return [];
    }
    // Pre-compute respondedItems size to avoid unnecessary filtering when empty
    if (respondedItems.size === 0) {
      return items;
    }
    return items.filter((item) => !respondedItems.has(item.id));
  }, [items, respondedItems]);

  // Ensure currentIndex is within bounds
  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, availableItems.length - 1));
  const currentItem = availableItems[safeCurrentIndex];

  // Auto-adjust currentIndex if it's out of bounds
  React.useEffect(() => {
    if (currentIndex !== safeCurrentIndex) {
      setCurrentIndex(safeCurrentIndex);
    }
  }, [currentIndex, safeCurrentIndex]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;

    try {
      await loadMoreItems();
    } catch (error) {
      toast.error("Failed to load more items");
    }
  };

  const handleRefresh = async () => {
    try {
      await refetch();
      toast.success("Items refreshed!");
    } catch (error) {
      toast.error("Failed to refresh items");
    }
  };

  const handleSwipe = async (direction: "pass" | "like") => {
    if (!currentItem || !user) return;

    const respondedItemId = currentItem.id;

    // Optimistic UI update - update immediately
    setRespondedItems((prev) => new Set(prev).add(respondedItemId));

    // Move to next item (increment instead of reset to 0)
    setCurrentIndex((prev) => {
      const nextIndex = prev + 1;
      // If we've reached the end of available items, try to load more
      if (nextIndex >= availableItems.length - 1 && hasMore && !loadingMore) {
        loadMoreItems();
      }
      return nextIndex < availableItems.length ? nextIndex : prev;
    });

    // Show immediate feedback
    if (direction === "like") {
      toast.success("Liked!");
    }

    // Record response in background
    try {
      await recordResponse({ itemId: respondedItemId, direction });

      // PRD §17 core conversion funnel, step 3: Like. Tracked after genuine
      // success, not at the optimistic-UI point above, so a swipe that ends
      // up rolled back (see catch below) isn't counted.
      if (direction === "like") {
        trackEvent("item_liked", { itemId: respondedItemId });
      }
    } catch (error: any) {
      // Rollback optimistic update on error
      setRespondedItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(respondedItemId);
        return newSet;
      });

      // Rollback currentIndex
      setCurrentIndex((prev) => Math.max(0, prev - 1));

      if (error.message && error.message.includes("Daily like limit reached")) {
        toast.error(ERROR_MESSAGES[ERROR_CODES.LIKE_LIMIT_EXCEEDED]);
        return;
      }
      toast.error("No connection, please try again.");
    }
  };

  const handleUndo = async () => {
    if (respondedItems.size === 0) return;
    const lastRespondedItem = Array.from(respondedItems).pop();
    if (!lastRespondedItem) return;

    try {
      const result = await undoResponse(lastRespondedItem);

      if (result.error) {
        // Covers both "already matched, can't undo" and any other server-side
        // refusal -- either way, nothing was actually reversed, so local state
        // (respondedItems/currentIndex) must not change either.
        toast.error(result.error.message);
        return;
      }

      setRespondedItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(lastRespondedItem);
        return newSet;
      });
      if (currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
      toast.success("Undo successful!");
    } catch (error) {
      toast.error("Couldn't undo, please try again.");
    }
  };

  const likesRemaining = likeLimit - dailyLikeCount;

  // Check if any filters are active
  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedConditions.length > 0 ||
    radius !== 50 ||
    minValue !== "" ||
    maxValue !== "" ||
    maxAge !== 30 ||
    minRating !== 3.0;

  if (loading && items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading items...</p>
          <p className="mt-2 text-sm text-gray-500">User: {user?.username || "Not logged in"}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-8 h-8 text-red-600">⚠️</div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Items</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <div className="space-x-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <DashboardHeader
        onRefresh={handleRefresh}
        onFilter={() => setShowFilter(true)}
        hasActiveFilters={hasActiveFilters}
      />

      <SwipeInterface
        currentItem={currentItem}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
        onSwipe={handleSwipe}
      />

      <SwipeControls
        onSwipe={handleSwipe}
        onUndo={handleUndo}
        disabled={!currentItem || likesRemaining <= 0}
        canUndo={respondedItems.size > 0}
      />

      <ItemStatus availableItemsCount={availableItems.length} hasMore={hasMore} />

      <AnimatePresence>
        {showFilter && (
          <CategoryFilter
            selectedCategories={selectedCategories}
            selectedConditions={selectedConditions}
            onCategoriesChange={setSelectedCategories}
            onConditionsChange={setSelectedConditions}
            onClose={() => setShowFilter(false)}
            radius={radius}
            minValue={minValue}
            maxValue={maxValue}
            maxAge={maxAge}
            minRating={minRating}
            onRadiusChange={setRadius}
            onMinValueChange={setMinValue}
            onMaxValueChange={setMaxValue}
            onMaxAgeChange={setMaxAge}
            onMinRatingChange={setMinRating}
          />
        )}
      </AnimatePresence>

      <LocationPrompt isOpen={showLocationPrompt} onClose={() => setShowLocationPrompt(false)} />
    </div>
  );
};
