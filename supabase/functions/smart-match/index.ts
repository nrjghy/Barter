import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface UserPreferences {
  categories: string[]
  conditions: string[]
  priceRange?: {
    min: number
    max: number
  }
  tags?: string[]
}

interface MatchRequest {
  userPreferences: UserPreferences
  userLocation: {
    latitude: number
    longitude: number
  }
  maxSearchRadius: number
  maxListingAge: number
  minSellerRating: number
  userId: string
}

// Enhanced caching with TTL
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

function getFromCache(key: string): any | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data
  }
  cache.delete(key)
  return null
}

function setCache(key: string, data: any, ttl: number = 5 * 60 * 1000): void {
  cache.set(key, { data, timestamp: Date.now(), ttl })
}

// Optimized distance calculation using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Batch processing for large datasets
async function processListingsBatch(listings: any[], request: MatchRequest, batchSize: number = 100) {
  const results = []
  
  for (let i = 0; i < listings.length; i += batchSize) {
    const batch = listings.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(listing => processListing(listing, request))
    )
    results.push(...batchResults.filter(Boolean))
  }
  
  return results
}

async function processListing(listing: any, request: MatchRequest) {
  try {
    // Quick distance check first (most expensive operation)
    const listingLocation = await parseLocation(listing.users.location)
    
    if (listingLocation) {
      const distanceKm = calculateDistance(
        request.userLocation.latitude,
        request.userLocation.longitude,
        listingLocation.lat,
        listingLocation.lon
      )
      
      // Early exit if outside radius
      if (distanceKm > request.maxSearchRadius) {
        return null
      }
    }
    
    // Continue with other calculations...
    const ageInDays = Math.floor(
      (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    
    if (ageInDays > request.maxListingAge) {
      return null
    }
    
    const sellerRating = listing.users.rating || 4.0
    if (sellerRating < request.minSellerRating) {
      return null
    }
    
    // Calculate scores (simplified for performance)
    const preferenceMatch = calculatePreferenceMatch(listing, request.userPreferences)
    const distanceScore = listingLocation ? 
      calculateDistanceScore(calculateDistance(
        request.userLocation.latitude,
        request.userLocation.longitude,
        listingLocation.lat,
        listingLocation.lon
      ), request.maxSearchRadius) : 100
    
    const matchScore = preferenceMatch * 0.6 + distanceScore * 0.4
    
    return {
      ...listing,
      matchScore,
      distanceKm: listingLocation ? calculateDistance(
        request.userLocation.latitude,
        request.userLocation.longitude,
        listingLocation.lat,
        listingLocation.lon
      ) : 0,
      ageInDays
    }
  } catch (error) {
    console.error('Error processing listing:', error)
    return null
  }
}

function calculatePreferenceMatch(listing: any, preferences: UserPreferences): number {
  let score = 0
  
  // Category match (primary factor)
  if (preferences.categories.includes(listing.category)) {
    score += 60
  }
  
  // Condition match
  if (preferences.conditions && preferences.conditions.includes(listing.condition)) {
    score += 30
  }
  
  // Tags match
  if (preferences.tags && listing.tags) {
    const matchingTags = listing.tags.filter((tag: string) => 
      preferences.tags!.some(prefTag => prefTag.toLowerCase() === tag.toLowerCase())
    )
    score += (matchingTags.length / Math.max(preferences.tags.length, 1)) * 10
  }
  
  return Math.min(score, 100)
}

function calculateDistanceScore(distanceKm: number, maxRadius: number): number {
  if (distanceKm > maxRadius) return 0
  return Math.max(0, 100 * (1 - distanceKm / maxRadius))
}

async function parseLocation(locationString: string | null): Promise<{ lat: number; lon: number } | null> {
  if (!locationString) return null
  
  const coordMatch = locationString.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/)
  if (coordMatch) {
    return {
      lat: parseFloat(coordMatch[1]),
      lon: parseFloat(coordMatch[2])
    }
  }
  
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const requestBody: MatchRequest = await req.json()
    const startTime = Date.now()

    // Enhanced cache key with user preferences
    const cacheKey = `match_v2_${JSON.stringify({
      categories: requestBody.userPreferences.categories.sort(),
      userId: requestBody.userId,
      radius: requestBody.maxSearchRadius,
      age: requestBody.maxListingAge
    })}`
    
    const cachedResult = getFromCache(cacheKey)
    if (cachedResult) {
      return new Response(
        JSON.stringify({
          listings: cachedResult,
          cached: true,
          processingTime: Date.now() - startTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Optimized query with better filtering
    const maxAgeDate = new Date()
    maxAgeDate.setDate(maxAgeDate.getDate() - requestBody.maxListingAge)

    const { data: listings, error } = await supabaseClient
      .from('items')
      .select(`
        id,
        title,
        description,
        category,
        condition,
        tags,
        image_url,
        created_at,
        user_id,
        users!inner (
          id,
          username,
          location,
          avatar_url,
          rating
        )
      `)
      .eq('is_active', true)
      .neq('user_id', requestBody.userId)
      .in('category', requestBody.userPreferences.categories)
      .gte('created_at', maxAgeDate.toISOString())
      .gte('users.rating', requestBody.minSellerRating)
      .limit(500) // Reasonable limit for performance

    if (error) {
      console.error('Database query error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch listings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!listings || listings.length === 0) {
      return new Response(
        JSON.stringify({ 
          listings: [], 
          message: 'No listings found matching your criteria',
          processingTime: Date.now() - startTime
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Process listings in batches for better performance
    const scoredListings = await processListingsBatch(listings, requestBody)
    
    // Sort by match score
    scoredListings.sort((a, b) => b.matchScore - a.matchScore)
    
    // Limit results
    const finalResults = scoredListings.slice(0, 50)
    
    // Cache results with shorter TTL for dynamic data
    setCache(cacheKey, finalResults, 2 * 60 * 1000) // 2 minutes

    const processingTime = Date.now() - startTime

    return new Response(
      JSON.stringify({
        listings: finalResults,
        metadata: {
          totalProcessed: listings.length,
          totalMatched: finalResults.length,
          processingTime,
          cached: false
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})