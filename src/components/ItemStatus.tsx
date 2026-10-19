import React from "react";

interface ItemStatusProps {
  availableItemsCount: number;
  hasMore: boolean;
}

// Small "20+ left" counter. Rendered inside the swipe controls row (left of the buttons).
export const ItemStatus: React.FC<ItemStatusProps> = React.memo(({ availableItemsCount, hasMore }) => {
  if (availableItemsCount <= 0) {
    return <p className="text-xs leading-tight text-gray-500">None left</p>;
  }
  return (
    <p className="text-xs leading-tight text-gray-500">
      <span className="block text-sm font-semibold text-gray-700">
        {availableItemsCount}
        {hasMore ? "+" : ""}
      </span>
      left
    </p>
  );
});

ItemStatus.displayName = "ItemStatus";
