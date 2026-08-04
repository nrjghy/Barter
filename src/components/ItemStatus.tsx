import React from "react";

interface ItemStatusProps {
  availableItemsCount: number;
  hasMore: boolean;
  likesRemaining: number;
}

export const ItemStatus: React.FC<ItemStatusProps> = React.memo(({ availableItemsCount, hasMore, likesRemaining }) => {
  return (
    <div className="mt-8 text-center">
      <p className="text-gray-600">
        {availableItemsCount > 0 ? (
          <>
            <span className="font-medium">{availableItemsCount}</span> items available
            {hasMore && <span className="text-sm text-gray-500 block">More items available</span>}
          </>
        ) : (
          "No items available"
        )}
      </p>
      {likesRemaining <= 0 && (
        <p className="text-red-600 text-sm mt-2">Daily like limit reached! Come back tomorrow for more.</p>
      )}
    </div>
  );
});

ItemStatus.displayName = "ItemStatus";
