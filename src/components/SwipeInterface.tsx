import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { SwipeCard } from "./SwipeCard";
import { LoadingSpinner } from "./LoadingSpinner";
import { ItemWithUser } from "../services/itemService";

interface SwipeInterfaceProps {
  currentItem: ItemWithUser | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSwipe: (direction: "left" | "right") => void;
}

export const SwipeInterface: React.FC<SwipeInterfaceProps> = React.memo(
  ({ currentItem, hasMore, loadingMore, onLoadMore, onSwipe }) => {
    return (
      <div className="relative h-[600px] mb-6">
        <AnimatePresence mode="wait">
          {currentItem ? (
            <SwipeCard key={currentItem.id} item={currentItem} onSwipe={onSwipe} />
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
                    onClick={onLoadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? <LoadingSpinner /> : "Load More Items"}
                  </button>
                )}
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

SwipeInterface.displayName = "SwipeInterface";
