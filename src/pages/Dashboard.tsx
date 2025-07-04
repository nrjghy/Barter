import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, RotateCcw, Filter, Zap } from 'lucide-react';
import { ItemCard } from '../components/ItemCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SmartMatchDialog } from '../components/SmartMatchDialog';
import { useItems } from '../hooks/useItems';
import { useMatches } from '../hooks/useMatches';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export const Dashboard: React.FC = () => {
  const { items, loading } = useItems();
  const { createMatch } = useMatches();
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipedItems, setSwipedItems] = useState<Set<string>>(new Set());
  const [showSmartMatch, setShowSmartMatch] = useState(false);

  const availableItems = items.filter(item => !swipedItems.has(item.id));
  const currentItem = availableItems[currentIndex];

  const handleSwipe = async (direction: 'left' | 'right') => {
    if (!currentItem || !user) return;

    setSwipedItems(prev => new Set(prev).add(currentItem.id));

    if (direction === 'right') {
      // Create a match request
      try {
        await createMatch(currentItem.id, currentItem.id, user.id, currentItem.user_id);
        toast.success('Match request sent!');
      } catch (error) {
        toast.error('Failed to send match request');
      }
    }

    // Move to next item
    if (currentIndex < availableItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handleUndo = () => {
    if (swipedItems.size > 0) {
      const lastSwipedItem = Array.from(swipedItems).pop();
      if (lastSwipedItem) {
        setSwipedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(lastSwipedItem);
          return newSet;
        });
        if (currentIndex > 0) {
          setCurrentIndex(prev => prev - 1);
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Discover Items</h2>
        <div className="flex space-x-2">
          <button 
            onClick={() => setShowSmartMatch(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200"
          >
            <Zap className="w-4 h-4" />
            <span>Smart Match</span>
          </button>
          <button className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
            <Filter className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="relative h-[600px] mb-6">
        <AnimatePresence mode="wait">
          {currentItem ? (
            <motion.div
              key={currentItem.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0"
            >
              <ItemCard item={currentItem} onSwipe={handleSwipe} showActions={true} />
            </motion.div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-12 h-12 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No more items!</h3>
                <p className="text-gray-600">Check back later for new listings</p>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center space-x-8">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => handleSwipe('left')}
          className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-red-300 transition-colors"
          disabled={!currentItem}
        >
          <X className="w-8 h-8 text-red-500" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleUndo}
          className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-gray-300 transition-colors"
          disabled={swipedItems.size === 0}
        >
          <RotateCcw className="w-5 h-5 text-gray-600" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => handleSwipe('right')}
          className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-green-300 transition-colors"
          disabled={!currentItem}
        >
          <Heart className="w-8 h-8 text-green-500" />
        </motion.button>
      </div>

      <div className="mt-8 text-center">
        <p className="text-gray-600">
          {availableItems.length > 0 ? (
            <>
              <span className="font-medium">{availableItems.length}</span> items available
            </>
          ) : (
            'No items available'
          )}
        </p>
      </div>

      <SmartMatchDialog 
        isOpen={showSmartMatch} 
        onClose={() => setShowSmartMatch(false)} 
      />
    </div>
  );
};