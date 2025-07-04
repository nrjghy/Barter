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
  maxSearchRadius: number // in km
  maxListingAge: number // in days
  minSellerRating: number // 1-5 scale
  userId: string
}

interface ListingResult {
  id: string
  title: string
  description: string
  category: string
  condition: string
  tags: string[]
  image_url: string | null
  created_at: string
  user_id: string
  users: {
    id: string
    username: string
    location: string | null
    avatar_url: string | null
    rating?: number
  }
  matchScore: number
  scoreComponents: {
    preferenceMatch: number
    distanceScore: number
    freshnessScore: number
    sellerRating: number
    completenessScore: number
  }
  distanceKm: number
  ageInDays: number
}

// Cache for frequently accessed data
const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getFromCache(key: string): any | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  cache.delete(key)
  return null
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, timestamp: Date.now() })
}

function validateInput(request: MatchRequest): string | null {
  if (!request.userPreferences || !Array.isArray(request.userPreferences.categories)) {
    return 'Invalid user preferences: categories must be an array'
  }

  if (!request.userLocation || 
      typeof request.userLocation.latitude !== 'number' || 
      typeof request.userLocation.longitude !== 'number') {
    return 'Invalid user location: latitude and longitude must be numbers'
  }

  if (request.userLocation.latitude < -90 || request.userLocation.latitude > 90) {
    return 'Invalid latitude: must be between -90 and 90'
  }

  if (request.userLocation.longitude < -180 || request.userLocation.longitude > 180) {
    return 'Invalid longitude: must be between -180 and 180'
  }

  if (typeof request.maxSearchRadius !== 'number' || request.maxSearchRadius <= 0 || request.maxSearchRadius > 1000) {
    return 'Invalid search radius: must be a positive number up to 1000 km'
  }

  if (typeof request.maxListingAge !== 'number' || request.maxListingAge <= 0 || request.maxListingAge > 365) {
    return 'Invalid listing age: must be a positive number up to 365 days'
  }

  if (typeof request.minSellerRating !== 'number' || request.minSellerRating < 1 || request.minSellerRating > 5) {
    return 'Invalid seller rating: must be between 1 and 5'
  }

  if (!request.userId || typeof request.userId !== 'string') {
    return 'Invalid user ID: must be a non-empty string'
  }

  return null
}

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

function calculatePreferenceMatch(listing: any, preferences: UserPreferences): number {
  let score = 0
  let maxScore = 0

  // Category match (40% of preference score)
  maxScore += 40
  if (preferences.categories.includes(listing.category)) {
    score += 40
  }

  // Condition match (30% of preference score)
  maxScore += 30
  if (preferences.conditions && preferences.conditions.includes(listing.condition)) {
    score += 30
  }

  // Tags match (30% of preference score)
  maxScore += 30
  if (preferences.tags && listing.tags) {
    const matchingTags = listing.tags.filter((tag: string) => 
      preferences.tags!.some(prefTag => prefTag.toLowerCase() === tag.toLowerCase())
    )
    const tagMatchRatio = matchingTags.length / Math.max(preferences.tags.length, 1)
    score += 30 * tagMatchRatio
  }

  return maxScore > 0 ? (score / maxScore) * 100 : 0
}

function calculateDistanceScore(distanceKm: number, maxRadius: number): number {
  if (distanceKm > maxRadius) return 0
  return Math.max(0, 100 * (1 - distanceKm / maxRadius))
}

function calculateFreshnessScore(ageInDays: number, maxAge: number): number {
  if (ageInDays > maxAge) return 0
  return Math.max(0, 100 * (1 - ageInDays / maxAge))
}

function calculateSellerRatingScore(rating: number): number {
  return (rating / 5) * 100
}

function calculateCompletenessScore(listing: any): number {
  let score = 0
  let maxScore = 0

  // Title (required, so always counts)
  maxScore += 20
  if (listing.title && listing.title.trim().length > 0) {
    score += 20
  }

  // Description
  maxScore += 25
  if (listing.description && listing.description.trim().length > 10) {
    score += 25
  }

  // Image
  maxScore += 25
  if (listing.image_url) {
    score += 25
  }

  // Tags
  maxScore += 15
  if (listing.tags && listing.tags.length > 0) {
    score += 15
  }

  // User profile completeness
  maxScore += 15
  if (listing.users.location) {
    score += 15
  }

  return maxScore > 0 ? (score / maxScore) * 100 : 0
}

function calculateOverallScore(components: any): number {
  return (
    components.preferenceMatch * 0.30 +
    components.distanceScore * 0.25 +
    components.freshnessScore * 0.20 +
    components.sellerRating * 0.15 +
    components.completenessScore * 0.10
  )
}

async function parseLocation(locationString: string | null): Promise<{ lat: number; lon: number } | null> {
  if (!locationString) return null
  
  // Try to parse coordinates from location string
  // This is a simplified parser - in production you'd use a geocoding service
  const coordMatch = locationString.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/)
  if (coordMatch) {
    return {
      lat: parseFloat(coordMatch[1]),
      lon: parseFloat(coordMatch[2])
    }
  }
  
  // For demo purposes, return null if we can't parse coordinates
  // In production, you'd geocode the location string
  return null
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const requestBody: MatchRequest = await req.json()
    
    // Validate input
    const validationError = validateInput(requestBody)
    if (validationError) {
      return new Response(
        JSON.stringify({ error: validationError }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const startTime = Date.now()

    // Check cache first
    const cacheKey = `match_${JSON.stringify(requestBody)}`
    const cachedResult = getFromCache(cacheKey)
    if (cachedResult) {
      return new Response(
        JSON.stringify({
          listings: cachedResult,
          cached: true,
          processingTime: Date.now() - startTime
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Calculate date threshold
    const maxAgeDate = new Date()
    maxAgeDate.setDate(maxAgeDate.getDate() - requestBody.maxListingAge)

    // Query listings with basic filters
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
          avatar_url
        )
      `)
      .eq('is_active', true)
      .neq('user_id', requestBody.userId)
      .in('category', requestBody.userPreferences.categories)
      .gte('created_at', maxAgeDate.toISOString())
      .limit(1000) // Performance limit

    if (error) {
      console.error('Database query error:', error)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch listings' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!listings || listings.length === 0) {
      return new Response(
        JSON.stringify({ 
          listings: [], 
          message: 'No listings found matching your criteria',
          processingTime: Date.now() - startTime
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Process and score listings
    const scoredListings: ListingResult[] = []

    for (const listing of listings) {
      try {
        // Parse listing location
        const listingLocation = await parseLocation(listing.users.location)
        
        let distanceKm = 0
        let distanceScore = 100 // Default to max score if no location

        if (listingLocation) {
          distanceKm = calculateDistance(
            requestBody.userLocation.latitude,
            requestBody.userLocation.longitude,
            listingLocation.lat,
            listingLocation.lon
          )

          // Skip if outside search radius
          if (distanceKm > requestBody.maxSearchRadius) {
            continue
          }

          distanceScore = calculateDistanceScore(distanceKm, requestBody.maxSearchRadius)
        }

        // Calculate listing age
        const ageInDays = Math.floor(
          (Date.now() - new Date(listing.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )

        // Skip if too old
        if (ageInDays > requestBody.maxListingAge) {
          continue
        }

        // Calculate seller rating (default to 4.0 if not available)
        const sellerRating = listing.users.rating || 4.0

        // Skip if seller rating too low
        if (sellerRating < requestBody.minSellerRating) {
          continue
        }

        // Calculate score components
        const preferenceMatch = calculatePreferenceMatch(listing, requestBody.userPreferences)
        const freshnessScore = calculateFreshnessScore(ageInDays, requestBody.maxListingAge)
        const sellerRatingScore = calculateSellerRatingScore(sellerRating)
        const completenessScore = calculateCompletenessScore(listing)

        const scoreComponents = {
          preferenceMatch,
          distanceScore,
          freshnessScore,
          sellerRating: sellerRatingScore,
          completenessScore
        }

        const matchScore = calculateOverallScore(scoreComponents)

        scoredListings.push({
          ...listing,
          matchScore,
          scoreComponents,
          distanceKm,
          ageInDays
        })

      } catch (listingError) {
        console.error('Error processing listing:', listing.id, listingError)
        // Continue with next listing
      }
    }

    // Sort by match score (highest first)
    scoredListings.sort((a, b) => b.matchScore - a.matchScore)

    // Cache the results
    setCache(cacheKey, scoredListings)

    const processingTime = Date.now() - startTime

    // Check if processing took too long
    if (processingTime > 500) {
      console.warn(`Slow query detected: ${processingTime}ms`)
    }

    return new Response(
      JSON.stringify({
        listings: scoredListings,
        metadata: {
          totalProcessed: listings.length,
          totalMatched: scoredListings.length,
          processingTime,
          cached: false
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})