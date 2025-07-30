import { useMutation } from "@tanstack/react-query";
import { ItemWithUser } from "./useItems";

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

const fetchSmartMatch = async (request: MatchRequest): Promise<MatchResponse> => {
  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-match`;
  const headers = {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch matches");
  }
  const data: MatchResponse = await response.json();
  return data;
};

export const useSmartMatch = () => {
  const mutation = useMutation({
    mutationFn: fetchSmartMatch,
  });

  // Helper to clear results (reset mutation state)
  const clearResults = () => {
    mutation.reset();
  };

  return {
    loading: mutation.isLoading,
    results: mutation.data?.listings ?? [],
    metadata: mutation.data?.metadata ?? null,
    error: mutation.error,
    findMatches: mutation.mutateAsync,
    clearResults,
  };
};
