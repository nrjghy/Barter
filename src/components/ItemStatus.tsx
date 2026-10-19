import React from "react";

interface ItemStatusProps {
  availableItemsCount: number;
  hasMore: boolean;
}

export const ItemStatus: React.FC<ItemStatusProps> = React.memo(({ availableItemsCount, hasMore }) => {
  return (
    <div className="mt-2 text-center">
      <p className="text-sm text-gray-500">
        {availableItemsCount > 0 ? (
          <>
            <span className="font-medium">
              {availableItemsCount}
              {hasMore ? "+" : ""}
            </span>{" "}
            left
          </>
        ) : (
          "No items available"
        )}
      </p>
    </div>
  );
});

ItemStatus.displayName = "ItemStatus";
