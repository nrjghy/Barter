import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, X, RotateCcw, Filter, Zap, AlertCircle, Grid3X3, Layers, RefreshCw } from "lucide-react";
import { SwipeCard } from "../components/SwipeCard";
import { EnhancedItemCard } from "../components/EnhancedItemCard";
import { CategoryFilter } from "../components/CategoryFilter";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { SmartMatchDialog } from "../components/SmartMatchDialog";
import { useItems, ItemWithUser } from "../hooks/useItems";
import { useSwipes } from "../hooks/useSwipes";
import { useAuth } from "../hooks/useAuth";
import toast from "react-hot-toast";

export const Dashboard: React.FC = () => {
  const { items, loading, error, hasMore, loadMoreItems, refetch, includeDemoUsers, toggleDemoUsers } = useItems();
  const { recordSwipe, dailySwipeCount, swipeLimit, getSwipedItems } = useSwipes();
  const { user } = useAuth();
  const [debugInfo, setDebugInfo] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipedItems, setSwipedItems] = useState<Set<string>>(new Set());
  const [showSmartMatch, setShowSmartMatch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [viewMode, setViewMode] = useState<"swipe" | "grid">("swipe");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load previously swiped items
  useEffect(() => {
    const loadSwipedItems = async () => {
      const swiped = await getSwipedItems();
      setSwipedItems(new Set(swiped));
    };

    if (user) {
      loadSwipedItems();
    }
  }, [user]); // Remove getSwipedItems from dependencies

  // Filter items based on selected categories and conditions
  const filteredItems = React.useMemo(() => {
    let filtered = items.filter((item) => !swipedItems.has(item.id));

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((item) => selectedCategories.includes(item.category));
    }

    if (selectedConditions.length > 0) {
      filtered = filtered.filter((item) => selectedConditions.includes(item.condition));
    }

    return filtered;
  }, [items, swipedItems, selectedCategories, selectedConditions]);

  const availableItems = filteredItems;
  const currentItem = availableItems[currentIndex];

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      await loadMoreItems();
    } catch (error) {
      toast.error("Failed to load more items");
    } finally {
      setLoadingMore(false);
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

  const handleSwipe = async (direction: "left" | "right" | "super") => {
    if (!currentItem || !user) return;
    try {
      await recordSwipe({ itemId: currentItem.id, direction });
      setSwipedItems((prev) => new Set(prev).add(currentItem.id));
      if (direction === "super") {
        toast.success("Super Like sent! ⚡");
      } else if (direction === "right") {
        toast.success("Right swipe!");
      }
    } catch (error: any) {
      if (error.message && error.message.includes("Daily swipe limit reached")) {
        return; // Toast already shown in useSwipes
      }
      toast.error("Failed to record swipe");
    }
  };

  const handleUndo = () => {
    // For demo purposes, allow undo of last swipe
    if (swipedItems.size > 0) {
      const lastSwipedItem = Array.from(swipedItems).pop();
      if (lastSwipedItem) {
        setSwipedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(lastSwipedItem);
          return newSet;
        });
        if (currentIndex > 0) {
          setCurrentIndex((prev) => prev - 1);
        }
        toast.success("Undo successful!");
      }
    }
  };

  const swipesRemaining = swipeLimit - dailySwipeCount;

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
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Items</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <div className="space-x-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Discover Items</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setDebugInfo(!debugInfo)}
            className="p-2 text-xs bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Debug
          </button>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Refresh items"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("swipe")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "swipe" ? "bg-white shadow-sm text-purple-600" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded-md transition-colors ${
                viewMode === "grid" ? "bg-white shadow-sm text-purple-600" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={() => setShowSmartMatch(true)}
            className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200"
          >
            <Zap className="w-4 h-4" />
            <span className="hidden sm:inline">Smart</span>
          </button>

          <button
            onClick={() => setShowFilter(true)}
            className={`p-2 rounded-lg transition-colors relative ${
              selectedCategories.length > 0 || selectedConditions.length > 0
                ? "bg-purple-100 text-purple-600"
                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
          >
            <Filter className="w-5 h-5 text-gray-600" />
            {(selectedCategories.length > 0 || selectedConditions.length > 0) && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Demo Users Filter - Only show for admin users */}
      {user?.role === "admin" && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">Admin Controls</span>
            </div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDemoUsers}
                onChange={(e) => toggleDemoUsers(e.target.checked)}
                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-blue-700">Show Demo Listings</span>
            </label>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            {includeDemoUsers ? "Showing all listings including demo users" : "Hiding listings from demo users"}
          </div>
        </div>
      )}
      {/* Debug Information */}
      {debugInfo && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <h3 className="font-semibold text-yellow-800 mb-2">Debug Information:</h3>
          <div className="space-y-1 text-yellow-700">
            <p>
              <strong>Total items loaded:</strong> {items.length}
            </p>
            <p>
              <strong>Filtered items:</strong> {availableItems.length}
            </p>
            <p>
              <strong>Current user ID:</strong> {user?.id}
            </p>
            <p>
              <strong>User role:</strong> {user?.role || "user"}
            </p>
            <p>
              <strong>Include demo users:</strong> {includeDemoUsers ? "Yes" : "No"}
            </p>
            <p>
              <strong>Swiped items count:</strong> {swipedItems.size}
            </p>
            <p>
              <strong>Selected categories:</strong>{" "}
              {selectedCategories.length > 0 ? selectedCategories.join(", ") : "None"}
            </p>
            <p>
              <strong>Selected conditions:</strong>{" "}
              {selectedConditions.length > 0 ? selectedConditions.join(", ") : "None"}
            </p>
            <p>
              <strong>Loading state:</strong> {loading ? "Yes" : "No"}
            </p>
            <p>
              <strong>Has more items:</strong> {hasMore ? "Yes" : "No"}
            </p>
            <p>
              <strong>Current page:</strong> {Math.floor(items.length / 20)}
            </p>
          </div>
        </div>
      )}

      {/* Swipe Counter */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              Daily Swipes: {dailySwipeCount}/{swipeLimit}
            </span>
          </div>
          <span className="text-sm text-blue-700">{swipesRemaining} remaining</span>
        </div>
        <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(dailySwipeCount / swipeLimit) * 100}%` }}
          />
        </div>
      </div>

      {viewMode === "swipe" ? (
        <div className="relative h-[600px] mb-6">
          <AnimatePresence mode="wait">
            {currentItem ? (
              <SwipeCard key={currentItem.id} item={currentItem} onSwipe={handleSwipe} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">No more items!</h3>
                  <p className="text-gray-600 mb-4">Check back later for new listings</p>
                  {hasMore && (
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? <LoadingSpinner /> : "Load More Items"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {availableItems.length > 0 ? (
            <>
              {availableItems.map((item) => (
                <EnhancedItemCard key={item.id} item={item} variant="compact" showActions={true} />
              ))}

              {hasMore && (
                <div className="text-center py-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? <LoadingSpinner /> : "Load More Items"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No items found!</h3>
              <p className="text-gray-600 mb-4">Try adjusting your filters or check back later</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Refresh Items
              </button>
            </div>
          )}
        </div>
      )}

      {viewMode === "swipe" && (
        <div className="flex items-center justify-center space-x-8 mb-6">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe("left")}
            className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-red-300 transition-colors"
            disabled={!currentItem || swipesRemaining <= 0}
          >
            <X className="w-8 h-8 text-red-500" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleUndo}
            className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-gray-300 transition-colors"
            disabled={swipedItems.size === 0}
          >
            <RotateCcw className="w-5 h-5 text-gray-600" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe("super")}
            className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full shadow-lg flex items-center justify-center border-2 border-white hover:shadow-xl transition-all"
            disabled={!currentItem || swipesRemaining <= 0}
          >
            <Zap className="w-6 h-6 text-white" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleSwipe("right")}
            className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-green-300 transition-colors"
            disabled={!currentItem || swipesRemaining <= 0}
          >
            <Heart className="w-8 h-8 text-green-500" />
          </motion.button>
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-gray-600">
          {availableItems.length > 0 ? (
            <>
              <span className="font-medium">{availableItems.length}</span> items available
              {hasMore && <span className="text-sm text-gray-500 block">More items available</span>}
            </>
          ) : (
            "No items available"
          )}
        </p>
        {swipesRemaining <= 0 && (
          <p className="text-red-600 text-sm mt-2">Daily swipe limit reached! Come back tomorrow for more.</p>
        )}
      </div>

      <SmartMatchDialog isOpen={showSmartMatch} onClose={() => setShowSmartMatch(false)} />

      <AnimatePresence>
        {showFilter && (
          <CategoryFilter
            selectedCategories={selectedCategories}
            selectedConditions={selectedConditions}
            onCategoriesChange={setSelectedCategories}
            onConditionsChange={setSelectedConditions}
            onClose={() => setShowFilter(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
