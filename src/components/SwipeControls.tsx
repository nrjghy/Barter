import React from "react";
import { motion } from "framer-motion";
import { Heart, X, RotateCcw } from "lucide-react";

interface SwipeControlsProps {
  onSwipe: (direction: "left" | "right" | "super") => void;
  onUndo: () => void;
  disabled: boolean;
  canUndo: boolean;
}

export const SwipeControls: React.FC<SwipeControlsProps> = React.memo(({ onSwipe, onUndo, disabled, canUndo }) => {
  return (
    <div className="flex items-center justify-center space-x-8 mb-6">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => onSwipe("left")}
        className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-red-300 transition-colors"
        disabled={disabled}
      >
        <X className="w-8 h-8 text-red-500" />
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onUndo}
        className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-gray-300 transition-colors"
        disabled={!canUndo}
      >
        <RotateCcw className="w-5 h-5 text-gray-600" />
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => onSwipe("super")}
        className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full shadow-lg flex items-center justify-center border-2 border-white hover:shadow-xl transition-all"
        disabled={disabled}
      >
        <span className="text-white text-xl font-bold">⚡</span>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => onSwipe("right")}
        className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-green-300 transition-colors"
        disabled={disabled}
      >
        <Heart className="w-8 h-8 text-green-500" />
      </motion.button>
    </div>
  );
});

SwipeControls.displayName = "SwipeControls";
