import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, X, Check } from 'lucide-react';
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from '../types';

interface CategoryFilterProps {
  selectedCategories: string[];
  selectedConditions: string[];
  onCategoriesChange: (categories: string[]) => void;
  onConditionsChange: (conditions: string[]) => void;
  onClose: () => void;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategories,
  selectedConditions,
  onCategoriesChange,
  onConditionsChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'conditions'>('categories');

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      onCategoriesChange(selectedCategories.filter(c => c !== category));
    } else {
      onCategoriesChange([...selectedCategories, category]);
    }
  };

  const toggleCondition = (condition: string) => {
    if (selectedConditions.includes(condition)) {
      onConditionsChange(selectedConditions.filter(c => c !== condition));
    } else {
      onConditionsChange([...selectedConditions, condition]);
    }
  };

  const clearAll = () => {
    onCategoriesChange([]);
    onConditionsChange([]);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <Filter className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Filter Items</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={clearAll}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Clear All
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'categories'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Categories ({selectedCategories.length})
          </button>
          <button
            onClick={() => setActiveTab('conditions')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'conditions'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Conditions ({selectedConditions.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-96">
          <AnimatePresence mode="wait">
            {activeTab === 'categories' ? (
              <motion.div
                key="categories"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-3"
              >
                {ITEM_CATEGORIES.map((category) => (
                  <motion.button
                    key={category}
                    onClick={() => toggleCategory(category)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                      selectedCategories.includes(category)
                        ? 'bg-purple-50 border-purple-200 text-purple-700'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="font-medium">{category}</span>
                    {selectedCategories.includes(category) && (
                      <Check className="w-5 h-5 text-purple-600" />
                    )}
                  </motion.button>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="conditions"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-3"
              >
                {ITEM_CONDITIONS.map((condition) => (
                  <motion.button
                    key={condition}
                    onClick={() => toggleCondition(condition)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                      selectedConditions.includes(condition)
                        ? 'bg-purple-50 border-purple-200 text-purple-700'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <span className="font-medium">{condition}</span>
                    {selectedConditions.includes(condition) && (
                      <Check className="w-5 h-5 text-purple-600" />
                    )}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 rounded-xl font-medium hover:from-pink-600 hover:to-purple-600 transition-all duration-200 shadow-lg"
          >
            Apply Filters
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};