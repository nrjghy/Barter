import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { CategoryFilter } from "../components/CategoryFilter";
import { SwipeInterface } from "../components/SwipeInterface";
import { SwipeControls } from "../components/SwipeControls";
import { ItemStatus } from "../components/ItemStatus";
import { OnboardingHint } from "../components/OnboardingHint";
import { useItems } from "../hooks/useItems";
import { useResponses } from "../hooks/useResponses";
import { useAuth } from "../hooks/useAuth";
import { useUserGroups, useBrowseScope } from "../hooks/useGroups";
import toast from "react-hot-toast";
import { trackEvent } from "../lib/analytics";
import { ERROR_CODES, ERROR_MESSAGES, GROUPS_ENABLED } from "../services/config";

export const Discover: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [respondedItems, setRespondedItems] = useState<Set<string>>(new Set());
  // handleUndo loops through candidates sequentially, and undoResponseLoading
  // genuinely goes false between each await -- a click during that gap
  // could start a second, overlapping invocation. This ref covers the
  // whole loop's duration, not just a single in-flight network call.
  const undoInFlightRef = useRef(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [pendingGroupIds, setPendingGroupIds] = useState<string[]>([]);

  // PRD §17 core conversion funnel, step 1: Discover landing.
  useEffect(() => {
    trackEvent("discover_viewed");
  }, []);
  const [showDiscoverHint, setShowDiscoverHint] = useState(!!user && !user.discoverHintDismissedAt);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  // Advanced filter states
  const [radius, setRadius] = useState(50);
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [maxAge, setMaxAge] = useState(30);
  const [minRating, setMinRating] = useState(3.0);
  const [includeUnrated, setIncludeUnrated] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Discover browse scope (Public vs. My Groups), entirely gated behind
  // GROUPS_ENABLED -- Barter2 (the current backend project) doesn't have the
  // Groups schema/RPCs deployed yet. useUserGroups/useBrowseScope take an
  // `enabled` flag rather than being called conditionally here, so this
  // still respects the rules of hooks while making no network calls when
  // disabled. Backed by users.browse_mode/browse_group_ids via
  // useBrowseScope; local state mirrors it once loaded so toggling feels
  // instant.
  const { groups } = useUserGroups(GROUPS_ENABLED);
  const { scope, updateScope } = useBrowseScope(GROUPS_ENABLED);
  const [browseMode, setBrowseMode] = useState<"public" | "groups">("public");
  const [checkedGroupIds, setCheckedGroupIds] = useState<string[]>([]);
  const [scopeInitialized, setScopeInitialized] = useState(false);

  useEffect(() => {
    if (GROUPS_ENABLED && !scopeInitialized && scope) {
      setBrowseMode(scope.mode);
      setCheckedGroupIds(scope.groupIds);
      setScopeInitialized(true);
    }
  }, [scope, scopeInitialized]);

  const handleBrowseModeChange = async (newMode: "public" | "groups") => {
    if (newMode === browseMode || (newMode === "groups" && groups.length === 0)) return;

    // First-ever switch to My Groups (nothing persisted yet): default to
    // every current group, checked, rather than an empty (zero-result) scope.
    let nextGroupIds = checkedGroupIds;
    if (newMode === "groups" && (scope?.groupIds.length ?? 0) === 0) {
      nextGroupIds = groups.map((g) => g.id);
      setCheckedGroupIds(nextGroupIds);
    }

    setBrowseMode(newMode);
    await updateScope({ mode: newMode, groupIds: newMode === "groups" ? nextGroupIds : undefined });
  };

  // The sheet's checkboxes edit pendingGroupIds only -- no RPC call, no
  // refetch per click. Re-seeded from the applied scope every time the
  // sheet opens, so a discard (tap outside / X) just leaves it stale until
  // the next open rather than needing an explicit reset.
  useEffect(() => {
    if (showGroupPicker) setPendingGroupIds(checkedGroupIds);
  }, [showGroupPicker]);

  const togglePendingGroup = (groupId: string) => {
    setPendingGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const handleGroupPickerDone = async () => {
    await updateScope({ mode: "groups", groupIds: pendingGroupIds });
    setCheckedGroupIds(pendingGroupIds);
    setShowGroupPicker(false);
  };

  const browseScopeIndicator = React.useMemo(() => {
    if (browseMode !== "groups") return null;
    const names = checkedGroupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean) as string[];
    if (names.length === 0) return "Showing items from no groups.";
    if (names.length === 1) return `Showing items from ${names[0]}.`;
    if (names.length === 2) return `Showing items from ${names[0]} and ${names[1]}.`;
    return `Showing items from ${names[0]} and ${names.length - 1} others.`;
  }, [browseMode, checkedGroupIds, groups]);

  const { items, loading, error, hasMore, loadMoreItems, refetch, loadingMore } = useItems({
    categories: selectedCategories.length > 0 ? selectedCategories : undefined,
    conditions: selectedConditions.length > 0 ? selectedConditions : undefined,
    radius: radius !== 50 ? radius : undefined,
    minValue: minValue !== "" ? minValue : undefined,
    maxValue: maxValue !== "" ? maxValue : undefined,
    maxAge: maxAge !== 30 ? maxAge : undefined,
    minRating: minRating !== 3.0 ? minRating : undefined,
    includeUnrated,
    excludeUserId: user?.id, // ✅ Exclude current user's own items
    // New account / location never set -> both null, get_items_browse skips
    // the radius bounds check entirely rather than erroring.
    lat: user?.latitude ?? null,
    lng: user?.longitude ?? null,
    // Not passed at all when GROUPS_ENABLED is false -- belt and suspenders
    // on top of the itemService.getItems fix, which is the one that
    // actually matters for correctness against Barter2.
    ...(GROUPS_ENABLED ? { groupIds: browseMode === "groups" ? checkedGroupIds : undefined } : {}),
  });
  const { recordResponse, dailyLikeCount, likeLimit, getRespondedItems, undoResponse, undoResponseLoading } = useResponses();

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
    setRefreshing(true);
    try {
      await refetch();
      toast.success("Items refreshed!");
    } catch (error) {
      toast.error("Failed to refresh items");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSwipe = async (direction: "pass" | "like") => {
    if (!currentItem || !user) return;

    const respondedItemId = currentItem.id;
    const respondedItemCategory = currentItem.category;
    const respondedItemIsCuratorOwned = currentItem.userIsCurator ?? false;

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

      // PRD §17 core conversion funnel, step 3: Like/Pass. Tracked after
      // genuine success, not at the optimistic-UI point above, so a swipe
      // that ends up rolled back (see catch below) isn't counted.
      if (direction === "like") {
        trackEvent("item_liked", {
          itemId: respondedItemId,
          category: respondedItemCategory,
          isCuratorOwned: respondedItemIsCuratorOwned,
        });
      } else {
        trackEvent("item_passed", {
          itemId: respondedItemId,
          category: respondedItemCategory,
          isCuratorOwned: respondedItemIsCuratorOwned,
        });
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
    if (respondedItems.size === 0 || undoResponseLoading || undoInFlightRef.current) return;
    undoInFlightRef.current = true;

    try {
      const candidates = Array.from(respondedItems).reverse(); // most recent first

      for (const candidateItemId of candidates) {
        try {
          const result = await undoResponse(candidateItemId);

          if (result.error) {
            if (result.error.code === ERROR_CODES.MATCH_ALREADY_EXISTS) {
              // Already matched, can't undo this one -- try the next most recent instead.
              continue;
            }
            toast.error(result.error.message, { id: "undo-toast" });
            return;
          }

          setRespondedItems((prev) => {
            const newSet = new Set(prev);
            newSet.delete(candidateItemId);
            return newSet;
          });
          if (currentIndex > 0) {
            setCurrentIndex((prev) => prev - 1);
          }
          toast.success("Undo successful!", { id: "undo-toast" });
          return;
        } catch (error) {
          toast.error("Couldn't undo, please try again.", { id: "undo-toast" });
          return;
        }
      }

      toast("Nothing left to undo right now.", { id: "undo-toast" });
    } finally {
      undoInFlightRef.current = false;
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
    <div className="max-w-md mx-auto px-4 py-4 flex flex-col discover-viewport">
      <OnboardingHint
        isOpen={showDiscoverHint}
        text="Swipe through items near you. Tap the heart to like something, or the X to pass."
        onDismiss={async () => {
          setShowDiscoverHint(false);
          await updateProfile({ discoverHintDismissedAt: new Date().toISOString() });
        }}
      />

      {GROUPS_ENABLED && (
      <div className="mb-3">
        <div className="grid grid-cols-2 gap-1 p-1 bg-[oklch(93%_0.01_95)] rounded-xl">
          <button
            onClick={() => handleBrowseModeChange("public")}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              browseMode === "public" ? "bg-white text-[oklch(22%_0.02_100)] shadow-sm" : "text-[oklch(50%_0.02_95)]"
            }`}
          >
            Public
          </button>
          <button
            onClick={() => {
              if (browseMode === "groups") {
                setShowGroupPicker(true);
              } else {
                handleBrowseModeChange("groups");
              }
            }}
            disabled={groups.length === 0}
            className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
              groups.length === 0
                ? "text-[oklch(75%_0.01_95)] cursor-not-allowed"
                : browseMode === "groups"
                ? "bg-white text-[oklch(22%_0.02_100)] shadow-sm"
                : "text-[oklch(50%_0.02_95)]"
            }`}
          >
            My groups
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="text-xs text-[oklch(50%_0.02_95)] mt-1.5 text-center">
            Join or{" "}
            <Link to="/groups" className="text-barter-600 hover:text-barter-700 font-medium transition-colors hover:underline">
              create
            </Link>{" "}
            a group to browse privately.
          </p>
        ) : browseMode === "groups" && browseScopeIndicator ? (
          <p className="text-xs text-[oklch(50%_0.02_95)] mt-1.5 text-center">{browseScopeIndicator}</p>
        ) : null}
      </div>
      )}

      <AnimatePresence>
        {showGroupPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowGroupPicker(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-[oklch(92%_0.01_95)]">
                <h2 className="text-lg font-bold text-[oklch(22%_0.02_100)]">My groups</h2>
                <button onClick={() => setShowGroupPicker(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="text-xs font-semibold text-[oklch(50%_0.02_95)] mb-2">Show items from:</div>
                <div className="space-y-1.5">
                  {groups.map((group) => (
                    <label
                      key={group.id}
                      className="flex items-center space-x-2 text-sm text-gray-700 bg-white rounded-lg px-3 py-2 border border-[oklch(92%_0.01_95)]"
                    >
                      <input
                        type="checkbox"
                        checked={pendingGroupIds.includes(group.id)}
                        onChange={() => togglePendingGroup(group.id)}
                        className="w-4 h-4 rounded border-gray-300 text-barter-600 focus:ring-barter-600"
                      />
                      <span>{group.name}</span>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleGroupPickerDone}
                  className="w-full mt-4 px-4 py-2.5 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SwipeInterface
        currentItem={currentItem}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
        onSwipe={handleSwipe}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <SwipeControls
        onSwipe={handleSwipe}
        onUndo={handleUndo}
        disabled={!currentItem || likesRemaining <= 0}
        canUndo={respondedItems.size > 0 && !undoResponseLoading && !undoInFlightRef.current}
        onFilter={() => setShowFilter(true)}
        hasActiveFilters={hasActiveFilters}
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
            includeUnrated={includeUnrated}
            onRadiusChange={setRadius}
            onMinValueChange={setMinValue}
            onMaxValueChange={setMaxValue}
            onMaxAgeChange={setMaxAge}
            onMinRatingChange={setMinRating}
            onIncludeUnratedChange={setIncludeUnrated}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
