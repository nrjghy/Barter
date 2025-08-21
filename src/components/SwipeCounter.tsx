import React from "react";
import { AlertCircle } from "lucide-react";

interface SwipeCounterProps {
  dailySwipeCount: number;
  swipeLimit: number;
  swipesRemaining: number;
}

export const SwipeCounter: React.FC<SwipeCounterProps> = React.memo(
  ({ dailySwipeCount, swipeLimit, swipesRemaining }) => {
    return (
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
    );
  }
);

SwipeCounter.displayName = "SwipeCounter";
