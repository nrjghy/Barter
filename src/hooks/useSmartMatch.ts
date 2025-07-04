import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ItemWithUser } from './useItems';

export interface UserPreferences {
  categories: string[];
  conditions: string[];
  priceRange?: {
    min: number;
    max: number;
  };
  tags?: string[];
}

export interface MatchRequest {
  userPreferences: UserPreferences;
  userLocation: {
    latitude: number;
    longitude: number;
  };
  maxSearchRadius: number; // in km
  maxListingAge: number; // in days
  minSellerRating: number; // 1-5 scale
  userId: string;
}

export interface SmartMatchResult extends ItemWithUser {
  matchScore: number;
  scoreComponents: {
    preferenceMatch: number;
    distanceScore: number;
    freshnessScore: number;
    sellerRating: number;
    completenessScore: number;
  };
  distanceKm: number;
  ageInDays: number;
}

export interface MatchResponse {
  listings: SmartMatchResult[];
  metadata?: {
    totalProcessed: number;
    totalMatched: number;
    processingTime: number;
    cached: boolean;
  };
  cached?: boolean;
  error?: string;
  message?: string;
}

export const useSmartMatch = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SmartMatchResult[]>([]);
  const [metadata, setMetadata] = useState<MatchResponse['metadata'] | null>(null);

  const findMatches = async (request: MatchRequest): Promise<MatchResponse> => {
    setLoading(true);
    
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-match`;
      
      const headers = {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch matches');
      }

      const data: MatchResponse = await response.json();
      
      setResults(data.listings);
      setMetadata(data.metadata || null);
      
      return data;
    } catch (error) {
      console.error('Smart match error:', error);
      const errorResponse: MatchResponse = {
        listings: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
      
      setResults([]);
      setMetadata(null);
      
      return errorResponse;
    } finally {
      setLoading(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setMetadata(null);
  };

  return {
    loading,
    results,
    metadata,
    findMatches,
    clearResults,
  };
};