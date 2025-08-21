import React from "react";
import { Filter, RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  onRefresh: () => void;
  onFilter: () => void;
  onClearSwipes: () => void;
  hasActiveFilters: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = React.memo(
  ({ onRefresh, onFilter, onClearSwipes, hasActiveFilters }) => {
    return (
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Discover Items</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Refresh items"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={onClearSwipes}
            className="p-2 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
            title="Clear swiped items (debug)"
          >
            Clear Swipes
          </button>

          <button
            onClick={onFilter}
            className={`p-2 rounded-lg transition-colors relative ${
              hasActiveFilters ? "bg-purple-100 text-purple-600" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
          >
            <Filter className="w-5 h-5 text-gray-600" />
            {hasActiveFilters && <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full" />}
          </button>
        </div>
      </div>
    );
  }
);

DashboardHeader.displayName = "DashboardHeader";
