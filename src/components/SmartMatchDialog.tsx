import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, MapPin, Clock, Star, Target } from 'lucide-react';
import { useSmartMatch, UserPreferences } from '../hooks/useSmartMatch';
import { useAuth } from '../hooks/useAuth';
import { ITEM_CATEGORIES, ITEM_CONDITIONS } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { ItemCard } from './ItemCard';
import toast from 'react-hot-toast';

interface SmartMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SmartMatchDialog: React.FC<SmartMatchDialogProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const { loading, results, metadata, findMatches } = useSmartMatch();
  
  const [preferences, setPreferences] = useState<UserPreferences>({
    categories: [],
    conditions: [],
    tags: [],
  });
  
  const [searchParams, setSearchParams] = useState({
    maxSearchRadius: 50,
    maxListingAge: 30,
    minSellerRating: 3.0,
  });

  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const getCurrentLocation = () => {
    // For now, use a default location to disable location-based filtering
    setUserLocation({
      latitude: 40.7128, // Default to NYC coordinates
      longitude: -74.0060,
    });
    toast.success('Using default location for search');
  };

  const handleSearch = async () => {
    if (!user) {
      toast.error('Please log in to search');
      return;
    }

    // Auto-set location if not set
    if (!userLocation) {
      getCurrentLocation();
    }

    if (preferences.categories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }

    const request = {
      userPreferences: preferences,
      userLocation: userLocation || { latitude: 40.7128, longitude: -74.0060 },
      ...searchParams,
      userId: user.id,
    };

    const response = await findMatches(request);
    
    if (response.error) {
      toast.error(response.error);
    } else if (response.listings.length === 0) {
      toast.info('No matches found. Try adjusting your criteria.');
    } else {
      toast.success(`Found ${response.listings.length} matches!`);
    }
  };

  const toggleCategory = (category: string) => {
    setPreferences(prev => ({
      ...prev,
      categories: prev.categories.includes(category)
        ? prev.categories.filter(c => c !== category)
        : [...prev.categories, category]
    }));
  };

  const toggleCondition = (condition: string) => {
    setPreferences(prev => ({
      ...prev,
      conditions: prev.conditions.includes(condition)
        ? prev.conditions.filter(c => c !== condition)
        : [...prev.conditions, condition]
    }));
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-2xl font-bold text-gray-900">Smart Match</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex h-[calc(90vh-80px)]">
            {/* Search Panel */}
            <div className="w-1/3 p-6 border-r overflow-y-auto">
              <div className="space-y-6">
                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Location
                  </label>
                  <button
                    onClick={getCurrentLocation}
                    disabled={locationLoading}
                    className="w-full flex items-center justify-center space-x-2 p-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {locationLoading ? (
                      <LoadingSpinner />
                    ) : (
                      <>
                        <MapPin className="w-4 h-4" />
                        <span>
                          {userLocation ? 'Location Detected' : 'Get Current Location'}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {/* Categories */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categories
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ITEM_CATEGORIES.map(category => (
                      <button
                        key={category}
                        onClick={() => toggleCategory(category)}
                        className={`p-2 text-sm rounded-lg border transition-colors ${
                          preferences.categories.includes(category)
                            ? 'bg-purple-100 border-purple-300 text-purple-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditions */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Conditions
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ITEM_CONDITIONS.map(condition => (
                      <button
                        key={condition}
                        onClick={() => toggleCondition(condition)}
                        className={`p-2 text-sm rounded-lg border transition-colors ${
                          preferences.conditions.includes(condition)
                            ? 'bg-purple-100 border-purple-300 text-purple-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {condition}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Parameters */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Distance: {searchParams.maxSearchRadius} km
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="200"
                      value={searchParams.maxSearchRadius}
                      onChange={(e) => setSearchParams(prev => ({
                        ...prev,
                        maxSearchRadius: parseInt(e.target.value)
                      }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Age: {searchParams.maxListingAge} days
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="90"
                      value={searchParams.maxListingAge}
                      onChange={(e) => setSearchParams(prev => ({
                        ...prev,
                        maxListingAge: parseInt(e.target.value)
                      }))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Min Rating: {searchParams.minSellerRating}
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.1"
                      value={searchParams.minSellerRating}
                      onChange={(e) => setSearchParams(prev => ({
                        ...prev,
                        minSellerRating: parseFloat(e.target.value)
                      }))}
                      className="w-full"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSearch}
                  disabled={loading || !userLocation || preferences.categories.length === 0}
                  className="w-full flex items-center justify-center space-x-2 p-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <LoadingSpinner />
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      <span>Find Matches</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results Panel */}
            <div className="flex-1 p-6 overflow-y-auto">
              {metadata && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Target className="w-4 h-4 text-purple-600" />
                      <span>{metadata.totalMatched} matches found</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-purple-600" />
                      <span>{metadata.processingTime}ms</span>
                    </div>
                  </div>
                </div>
              )}

              {results.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {results.map(item => (
                    <div key={item.id} className="relative">
                      <ItemCard item={item} showActions={true} />
                      
                      {/* Match Score Overlay */}
                      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-2">
                        <div className="flex items-center space-x-2">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="font-bold text-sm">
                            {Math.round(item.matchScore)}%
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {item.distanceKm.toFixed(1)} km away
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {loading ? 'Searching...' : 'No results yet'}
                  </h3>
                  <p className="text-gray-600">
                    {loading 
                      ? 'Finding the best matches for you...' 
                      : 'Configure your preferences and search for matches'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};