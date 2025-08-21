// Service layer types and interfaces

export interface SwipeData {
  userId: string;
  itemId: string;
  direction: "left" | "right" | "super";
}

export interface SwipeLimitData {
  canSwipe: boolean;
  dailySwipeCount: number;
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
  imageUrl?: string;
  tags?: string[];
  userId: string;
  isActive: boolean;
  price?: number;
  sourceUrl?: string;
  createdAt: string;
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
  matchId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  tradeExperience: "excellent" | "good" | "fair" | "poor";
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
  type: "match" | "message" | "trade_completed" | "review" | "system";
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
