import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, X, Check } from "lucide-react";
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from "../types";

interface CategoryFilterProps {
  selectedCategories: string[];
  selectedConditions: string[];
  onCategoriesChange: (categories: string[]) => void;
  onConditionsChange: (conditions: string[]) => void;
  onClose: () => void;
  // Advanced filter props
  radius?: number;
  minValue?: string;
  maxValue?: string;
  maxAge?: number;
  minRating?: number;
  includeUnrated?: boolean;
  onRadiusChange?: (radius: number) => void;
  onMinValueChange?: (value: string) => void;
  onMaxValueChange?: (value: string) => void;
  onMaxAgeChange?: (age: number) => void;
  onMinRatingChange?: (rating: number) => void;
  onIncludeUnratedChange?: (val: boolean) => void;
}

export const CategoryFilter: React.FC<CategoryFilterProps> = ({
  selectedCategories,
  selectedConditions,
  onCategoriesChange,
  onConditionsChange,
  onClose,
  // Advanced filter props
  radius = 50,
  minValue = "",
  maxValue = "",
  maxAge = 30,
  minRating = 3.0,
  includeUnrated = true,
  onRadiusChange,
  onMinValueChange,
  onMaxValueChange,
  onMaxAgeChange,
  onMinRatingChange,
  onIncludeUnratedChange,
}) => {
  // Local state for filters - only applied when user clicks Apply
  const [localCategories, setLocalCategories] = useState(selectedCategories);
  const [localConditions, setLocalConditions] = useState(selectedConditions);
  const [localRadius, setLocalRadius] = useState(radius);
  const [localMinValue, setLocalMinValue] = useState(minValue);
  const [localMaxValue, setLocalMaxValue] = useState(maxValue);
  const [localMaxAge, setLocalMaxAge] = useState(maxAge);
  const [localMinRating, setLocalMinRating] = useState(minRating);
  const [localIncludeUnrated, setLocalIncludeUnrated] = useState(includeUnrated);

  // Update local state when props change (e.g., when component reopens)
  React.useEffect(() => {
    setLocalCategories(selectedCategories);
    setLocalConditions(selectedConditions);
    setLocalRadius(radius);
    setLocalMinValue(minValue);
    setLocalMaxValue(maxValue);
    setLocalMaxAge(maxAge);
    setLocalMinRating(minRating);
    setLocalIncludeUnrated(includeUnrated);
  }, [selectedCategories, selectedConditions, radius, minValue, maxValue, maxAge, minRating, includeUnrated]);

  const toggleCategory = (category: string) => {
    if (localCategories.includes(category)) {
      setLocalCategories(localCategories.filter((c) => c !== category));
    } else {
      setLocalCategories([...localCategories, category]);
    }
  };

  const toggleCondition = (condition: string) => {
    if (localConditions.includes(condition)) {
      setLocalConditions(localConditions.filter((c) => c !== condition));
    } else {
      setLocalConditions([...localConditions, condition]);
    }
  };

  const clearAll = () => {
    setLocalCategories([]);
    setLocalConditions([]);
    setLocalRadius(50);
    setLocalMinValue("");
    setLocalMaxValue("");
    setLocalMaxAge(30);
    setLocalMinRating(3.0);
    setLocalIncludeUnrated(true);
  };

  const handleApply = () => {
    // Apply all local changes at once
    onCategoriesChange(localCategories);
    onConditionsChange(localConditions);
    if (onRadiusChange) onRadiusChange(localRadius);
    if (onMinValueChange) onMinValueChange(localMinValue);
    if (onMaxValueChange) onMaxValueChange(localMaxValue);
    if (onMaxAgeChange) onMaxAgeChange(localMaxAge);
    if (onMinRatingChange) onMinRatingChange(localMinRating);
    if (onIncludeUnratedChange) onIncludeUnratedChange(localIncludeUnrated);
    onClose();
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
            <div className="w-10 h-10 bg-barter-100 rounded-full flex items-center justify-center">
              <Filter className="w-5 h-5 text-barter-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Filter Items</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={clearAll} className="text-sm text-barter-600 hover:text-barter-700 font-medium">
              Clear All
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content - Single scrollable interface */}
        <div className="p-6 overflow-y-auto max-h-96">
          {/* Categories Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Categories</h3>
            <div className="grid grid-cols-2 gap-3">
              {ITEM_CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    localCategories.includes(category)
                      ? "bg-barter-50 border-barter-200 text-barter-700"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Conditions Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Condition</h3>
            <div className="grid grid-cols-2 gap-3">
              {ITEM_CONDITIONS.map((condition) => (
                <button
                  key={condition}
                  onClick={() => toggleCondition(condition)}
                  className={`p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                    localConditions.includes(condition)
                      ? "bg-barter-50 border-barter-200 text-barter-700"
                      : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {condition}
                </button>
              ))}
            </div>
          </div>

          {/* Radius Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Search Radius</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>0 km</span>
                <span className="font-medium text-barter-600">{localRadius} km</span>
                <span>100 km</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={localRadius}
                onChange={(e) => setLocalRadius(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>

          {/* Value Range Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Estimated Value</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-2">Min Value</label>
                <input
                  type="number"
                  placeholder="0"
                  value={localMinValue}
                  onChange={(e) => setLocalMinValue(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-2">Max Value</label>
                <input
                  type="number"
                  placeholder="1000"
                  value={localMaxValue}
                  onChange={(e) => setLocalMaxValue(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-barter-600 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Age Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Maximum Listing Age</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>1 day</span>
                <span className="font-medium text-barter-600">{localMaxAge} days</span>
                <span>365 days</span>
              </div>
              <input
                type="range"
                min="1"
                max="365"
                value={localMaxAge}
                onChange={(e) => setLocalMaxAge(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
            </div>
          </div>

          {/* Rating Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Minimum Seller Rating</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-gray-600">
                <span>1.0</span>
                <span className="font-medium text-barter-600">{localMinRating.toFixed(1)}</span>
                <span>5.0</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={localMinRating}
                onChange={(e) => setLocalMinRating(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
              />
              <label className="flex items-center space-x-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={localIncludeUnrated}
                  onChange={(e) => setLocalIncludeUnrated(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-barter-600 focus:ring-barter-600"
                />
                <span>Include sellers with no ratings yet</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={handleApply}
            className="w-full bg-barter-600 text-white py-3 rounded-xl font-medium hover:bg-barter-700 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
