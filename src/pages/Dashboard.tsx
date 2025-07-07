import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, RotateCcw, Filter, Zap, AlertCircle } from 'lucide-react';
import { SwipeCard } from '../components/SwipeCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SmartMatchDialog } from '../components/SmartMatchDialog';
import { useItems } from '../hooks/useItems';
import { useSwipes } from '../hooks/useSwipes';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';

export const Dashboard: React.FC = () => {
  const { items, loading } = useItems();
  const { recordSwipe, dailySwipeCount, swipeLimit, getSwipedItems } = useSwipes();
  const { user } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swipedItems, setSwipedItems] = useState<Set<string>>(new Set());
  const [showSmartMatch, setShowSmartMatch] = useState(false);

  // Load previously swiped items
  useEffect(() => {
    const loadSwipedItems = async () => {
      const swiped = await getSwipedItems();
      setSwipedItems(new Set(swiped));
    };
    
    if (user) {
      loadSwipedItems();
    }
  }, [user, getSwipedItems]);

  const availableItems = items.filter(item => !swipedItems.has(item.id));
  const currentItem = availableItems[currentIndex];

  const handleSwipe = async (direction: 'left' | 'right' | 'super') => {
    if (!currentItem || !user) return;

    // Record the swipe
    const { error } = await recordSwipe(currentItem.id, direction);
    
    if (error) {
      if (error.message.includes('Daily swipe limit reached')) {
        return; // Toast already shown in useSwipes
      }
      toast.error('Failed to record swipe');
      return;
    }

    // Add to local swiped items
    setSwipedItems(prev => new Set(prev).add(currentItem.id));

    // Show feedback for the swipe
    if (direction === 'super') {
      toast.success('Super Like sent! ⚡');
    } else if (direction === 'right') {
      toast.success('Liked! 💖');
    }

    // Move to next item
    if (currentIndex < availableItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const handleUndo = () => {
    // For demo purposes, allow undo of last swipe
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
        toast.success('Undo successful!');
      }
    }
  };

  const swipesRemaining = swipeLimit - dailySwipeCount;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-4">
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

      {/* Swipe Counter */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              Daily Swipes: {dailySwipeCount}/{swipeLimit}
            </span>
          </div>
          <span className="text-sm text-blue-700">
            {swipesRemaining} remaining
          </span>
        </div>
        <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(dailySwipeCount / swipeLimit) * 100}%` }}
          />
        </div>
      </div>

      <div className="relative h-[600px] mb-6">
        <AnimatePresence mode="wait">
          {currentItem ? (
            <SwipeCard
              key={currentItem.id}
              item={currentItem}
              onSwipe={handleSwipe}
            />
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
          disabled={!currentItem || swipesRemaining <= 0}
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
          onClick={() => handleSwipe('super')}
          className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full shadow-lg flex items-center justify-center border-2 border-white hover:shadow-xl transition-all"
          disabled={!currentItem || swipesRemaining <= 0}
        >
          <Zap className="w-6 h-6 text-white" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => handleSwipe('right')}
          className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center border-2 border-gray-200 hover:border-green-300 transition-colors"
          disabled={!currentItem || swipesRemaining <= 0}
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
        {swipesRemaining <= 0 && (
          <p className="text-red-600 text-sm mt-2">
            Daily swipe limit reached! Come back tomorrow for more.
          </p>
        )}
      </div>

      <SmartMatchDialog 
        isOpen={showSmartMatch} 
        onClose={() => setShowSmartMatch(false)} 
      />
    </div>
  );
};