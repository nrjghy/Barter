// Service layer types and interfaces

export interface SwipeData {
  userId: string;
  itemId: string;
  direction: "left" | "right";
}

export interface SwipeLimitData {
  canSwipe: boolean;
  dailySwipeCount: number;
}

export interface SwipeResult {
  success: boolean;
  dailySwipeCount: number;
  canSwipe: boolean;
  matchCheckNeeded: boolean;
}

export interface MatchData {
  itemId1: string;
  itemId2: string;
  userId1: string;
  userId2: string;
  isSuperLike: boolean;
}

export interface ItemData {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: string;
  imageUrls?: string[]; // ✅ Changed from single imageUrl to array of imageUrls
  tags?: string[];
  userId: string;
  isActive: boolean;
  status?: "active" | "cancelled" | "traded" | "expired";
  // Update fields to match database schema:
  estimatedValue?: number | null;
  valueCurrency?: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserData {
  id: string;
  username: string;
  email: string;
  location?: string;
  avatarUrl?: string;
  role: string;
  rating?: number;
  totalRatings?: number;
}

export interface ReviewData {
  tradeCompletionId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
}

export interface ReportData {
  reporterId: string;
  reportedItemId: string;
  reportedUserId: string;
  reason: string;
  description?: string;
}

export interface NotificationData {
  userId: string;
  type: "match" | "message" | "trade_completed" | "review" | "system" | "item_unavailable" | "review_reminder" | "issue_status";
  title: string;
  content: string;
  data?: Record<string, unknown>;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface FilterOptions {
  categories?: string[];
  conditions?: string[];
  excludeUserId?: string;
  isActive?: boolean;
  // Advanced filter options
  radius?: number;
  minValue?: string;
  maxValue?: string;
  maxAge?: number;
  minRating?: number;
  // Caller's own location, for the radius filter. Both null/undefined skip
  // the radius bounds check entirely (get_items_browse handles this).
  lat?: number | null;
  lng?: number | null;
}

export interface ServiceError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ServiceResult<T> {
  data?: T;
  error?: ServiceError;
}

// Configuration types
export interface AppConfig {
  swipeLimit: number;
  itemsPerPage: number;
  maxRetries: number;
  cacheTimeout: number;
}

// Event types for real-time updates
export interface SwipeEvent {
  userId: string;
  itemId: string;
  direction: "left" | "right" | "super";
  timestamp: string;
}

export interface MatchEvent {
  matchId: string;
  userId1: string;
  userId2: string;
  itemId1: string;
  itemId2: string;
  isSuperLike: boolean;
  timestamp: string;
}

export interface MessageEvent {
  matchId: string;
  senderId: string;
  content: string;
  messageType: "text" | "image" | "template";
  timestamp: string;
}
