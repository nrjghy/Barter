import React from "react";
import { motion } from "framer-motion";
import { Heart, X, Undo2, RefreshCw, Filter } from "lucide-react";
import { InfoTooltip } from "./InfoTooltip";

interface SwipeControlsProps {
  onSwipe: (direction: "pass" | "like") => void;
  onUndo: () => void;
  disabled: boolean;
  canUndo: boolean;
  onRefresh: () => void;
  onFilter: () => void;
  hasActiveFilters: boolean;
}

export const SwipeControls: React.FC<SwipeControlsProps> = React.memo(
  ({ onSwipe, onUndo, disabled, canUndo, onRefresh, onFilter, hasActiveFilters }) => {
    return (
      <div className="flex items-center justify-between mb-6">
        <div className="relative flex-shrink-0">
          <button
            onClick={onRefresh}
            className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors"
            title="Refresh items"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full">
            <InfoTooltip text="Reload your Discover feed to check for new listings." label="Refresh" />
          </div>
        </div>

        <div className="flex items-center justify-center space-x-8">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSwipe("pass")}
            className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-red-300 transition-colors"
            disabled={disabled}
          >
            <X className="w-8 h-8 text-red-500" />
          </motion.button>

          <div className="relative flex-shrink-0">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onUndo}
              className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-gray-300 transition-colors"
              disabled={!canUndo}
            >
              <Undo2 className="w-5 h-5 text-gray-600" />
            </motion.button>
            <div className="absolute -top-1.5 -right-1.5 bg-white rounded-full">
              <InfoTooltip
                text="Undo your last swipe, as long as it hasn't already led to a match."
                label="Undo"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onSwipe("like")}
            className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-green-300 transition-colors"
            disabled={disabled}
          >
            <Heart className="w-8 h-8 text-green-500" />
          </motion.button>
        </div>

        <button
          onClick={onFilter}
          className={`w-8 h-8 flex-shrink-0 rounded-lg border flex items-center justify-center transition-colors relative ${
            hasActiveFilters
              ? "border-barter-600 bg-barter-100 text-barter-600"
              : "border-gray-200 hover:bg-gray-100 text-gray-500"
          }`}
          title="Filter items"
        >
          <Filter className="w-4 h-4" />
          {hasActiveFilters && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-barter-600 rounded-full" />}
        </button>
      </div>
    );
  }
);

SwipeControls.displayName = "SwipeControls";
