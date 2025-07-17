import React from 'react';
import { Package } from 'lucide-react';
import { Item } from '../types/database';

interface OfferedItemsDisplayProps {
  items: Item[];
  title: string;
  emptyMessage?: string;
}

export const OfferedItemsDisplay: React.FC<OfferedItemsDisplayProps> = ({
  items,
  title,
  emptyMessage = "No items offered"
}) => {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-4">
        <Package className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">{title}</h4>
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-20 bg-white rounded-lg border border-gray-200 overflow-hidden"
          >
            <div className="aspect-square bg-gray-100">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="w-6 h-6 text-gray-400" />
                </div>
              )}
            </div>
            <div className="p-2">
              <p className="text-xs font-medium text-gray-900 truncate" title={item.title}>
                {item.title}
              </p>
              <p className="text-xs text-gray-500 truncate">{item.condition}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};