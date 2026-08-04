import React from "react";
import { motion } from "framer-motion";
import { Heart, X, RotateCcw } from "lucide-react";

interface SwipeControlsProps {
  onSwipe: (direction: "pass" | "like") => void;
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
        onClick={() => onSwipe("pass")}
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
        onClick={() => onSwipe("like")}
        className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-green-300 transition-colors"
        disabled={disabled}
      >
        <Heart className="w-8 h-8 text-green-500" />
      </motion.button>
    </div>
  );
});

SwipeControls.displayName = "SwipeControls";
