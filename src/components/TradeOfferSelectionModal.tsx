import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Package, Check, ArrowRight, AlertCircle } from "lucide-react";
import { useItems, ItemWithUser } from "../hooks/useItems";
import { Item } from "../types/database";
import { LoadingSpinner } from "./LoadingSpinner";

interface TradeOfferSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentItem: ItemWithUser;
  onConfirm: (offeredItemIds: string[]) => void;
  swipeDirection: "right" | "super";
}

export const TradeOfferSelectionModal: React.FC<TradeOfferSelectionModalProps> = ({
  isOpen,
  onClose,
  currentItem,
  onConfirm,
  swipeDirection,
}) => {
  const { userItems, loading } = useItems();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const activeUserItems = userItems.filter((item) => item.is_active);

  const handleItemToggle = (itemId: string) => {
    setSelectedItemIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  };

  const handleConfirm = () => {
    onConfirm(selectedItemIds);
    setSelectedItemIds([]);
  };

  const handleSkip = () => {
    onConfirm([]);
    setSelectedItemIds([]);
  };

  const handleClose = () => {
    setSelectedItemIds([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b flex-shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {swipeDirection === "super" ? "Super Like!" : "Like!"} What will you trade?
                </h2>
                <p className="text-sm text-gray-600">Select items to offer for trade</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Target Item */}
          <div className="p-4 bg-gray-50 border-b flex-shrink-0">
            <p className="text-sm font-medium text-gray-700 mb-2">You're interested in:</p>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden">
                {currentItem.image_url && currentItem.image_url.trim() !== "" ? (
                  <img src={currentItem.image_url} alt={currentItem.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-200" />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{currentItem.title}</h3>
                <p className="text-sm text-gray-600">by {currentItem.user.username}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : activeUserItems.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No items to trade</h3>
                  <p className="text-gray-600 mb-4">You need to add items before you can make trade offers.</p>
                  <button
                    onClick={handleSkip}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Continue without trade offer
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Your Items</h3>
                    <p className="text-sm text-gray-600">
                      Select one or more items you're willing to trade ({selectedItemIds.length} selected)
                    </p>
                  </div>

                  <div className="space-y-3">
                    {activeUserItems.map((item) => (
                      <motion.button
                        key={item.id}
                        onClick={() => handleItemToggle(item.id)}
                        className={`w-full flex items-center space-x-3 p-3 rounded-xl border-2 transition-all ${
                          selectedItemIds.includes(item.id)
                            ? "bg-purple-50 border-purple-200 text-purple-700"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                        }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="w-12 h-12 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                          {item.image_url && item.image_url.trim() !== "" ? (
                            <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gray-200" />
                          )}
                        </div>

                        <div className="flex-1 text-left">
                          <h4 className="font-medium">{item.title}</h4>
                          <p className="text-sm opacity-75">
                            {item.category} • {item.condition}
                          </p>
                        </div>

                        {selectedItemIds.includes(item.id) && (
                          <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          {activeUserItems.length > 0 && (
            <div className="flex-shrink-0 p-6 border-t bg-gray-50 space-y-3">
              <button
                onClick={handleConfirm}
                disabled={selectedItemIds.length === 0}
                className="w-full flex items-center justify-center space-x-2 py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-medium hover:from-pink-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>
                  {selectedItemIds.length === 0
                    ? "Select items to trade"
                    : `Offer ${selectedItemIds.length} item${selectedItemIds.length > 1 ? "s" : ""}`}
                </span>
                {selectedItemIds.length > 0 && <ArrowRight className="w-4 h-4" />}
              </button>

              <button
                onClick={handleSkip}
                className="w-full py-2 text-gray-600 hover:text-gray-800 transition-colors font-medium"
              >
                Continue without trade offer
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
