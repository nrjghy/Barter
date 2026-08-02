import { AppConfig } from "./types";

// Application configuration
export const APP_CONFIG: AppConfig = {
  swipeLimit: 50,
  itemsPerPage: 20,
  maxRetries: 3,
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
};

// Validation constants
export const VALIDATION_RULES = {
  username: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_]+$/,
  },
  password: {
    minLength: 6,
    maxLength: 128,
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  itemTitle: {
    minLength: 1,
    maxLength: 100,
  },
  itemDescription: {
    minLength: 1,
    maxLength: 1000,
  },
  reviewComment: {
    maxLength: 500,
  },
  reportDescription: {
    maxLength: 1000,
  },
} as const;

// Business rules
export const BUSINESS_RULES = {
  match: {
    maxPendingMatches: 10,
    autoExpireDays: 7,
  },
  review: {
    minRating: 1,
    maxRating: 5,
    requiredAfterDays: 3,
  },
  report: {
    maxReportsPerItem: 5,
    autoReviewThreshold: 3,
  },
  notification: {
    maxUnread: 50,
    retentionDays: 30,
  },
  // NOTE: this key didn't exist before, messageService.ts referenced
  // BUSINESS_RULES.message.* without it ever being defined, so the file
  // could not compile. Values below are a reasonable placeholder, not a
  // confirmed product decision -- flag if you want different numbers.
  message: {
    rateLimitWindowMs: 60 * 1000, // 1 minute
    maxMessagesPerWindow: 30,
  },
} as const;

// Error codes
export const ERROR_CODES = {
  SWIPE_LIMIT_EXCEEDED: "SWIPE_LIMIT_EXCEEDED",
  ITEM_NOT_FOUND: "ITEM_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  MATCH_ALREADY_EXISTS: "MATCH_ALREADY_EXISTS",
  INVALID_SWIPE_DIRECTION: "INVALID_SWIPE_DIRECTION",
  DUPLICATE_REVIEW: "DUPLICATE_REVIEW",
  INVALID_RATING: "INVALID_RATING",
  UNAUTHORIZED: "UNAUTHORIZED",
  NETWORK_ERROR: "NETWORK_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
  // NOTE: also referenced by messageService.ts but never defined before.
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  SWIPE_RECORDED: "Swipe recorded successfully",
  MATCH_CREATED: "🎉 It's a match! You both liked each other's items!",
  MATCH_UPDATED: "Match updated successfully",
  REVIEW_CREATED: "Review submitted successfully",
  REPORT_CREATED: "Report submitted successfully",
  ITEM_CREATED: "Item created successfully",
  ITEM_UPDATED: "Item updated successfully",
  ITEM_DELETED: "Item deleted successfully",
  PROFILE_UPDATED: "Profile updated successfully",
} as const;

// Error messages
export const ERROR_MESSAGES = {
  [ERROR_CODES.SWIPE_LIMIT_EXCEEDED]: "Daily swipe limit reached! Come back tomorrow for more swipes.",
  [ERROR_CODES.ITEM_NOT_FOUND]: "Item not found",
  [ERROR_CODES.USER_NOT_FOUND]: "User not found",
  [ERROR_CODES.MATCH_ALREADY_EXISTS]: "Match already exists",
  [ERROR_CODES.INVALID_SWIPE_DIRECTION]: "Invalid swipe direction",
  [ERROR_CODES.DUPLICATE_REVIEW]: "You have already reviewed this match",
  [ERROR_CODES.INVALID_RATING]: "Rating must be between 1 and 5",
  [ERROR_CODES.UNAUTHORIZED]: "You are not authorized to perform this action",
  [ERROR_CODES.NETWORK_ERROR]: "Network error occurred. Please try again.",
  [ERROR_CODES.VALIDATION_ERROR]: "Validation error occurred",
  [ERROR_CODES.UNKNOWN_ERROR]: "An unexpected error occurred",
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Too many messages sent recently. Please wait a moment.",
} as const;

// Database table names
export const TABLES = {
  USERS: "users",
  ITEMS: "items",
  SWIPES: "swipes",
  MATCHES: "matches",
  REVIEWS: "reviews",
  REPORTS: "reports",
  NOTIFICATIONS: "notifications",
  MESSAGES: "messages",
  USER_BLOCKS: "user_blocks",
  CONNECTIONS: "connections",
  CONNECTION_ITEM_INTERESTS: "connection_item_interests",
  CONNECTION_READS: "connection_reads",
  TRADE_COMPLETIONS: "trade_completions",
} as const;

// Real-time channels
export const CHANNELS = {
  MATCHES: "matches",
  MESSAGES: "messages",
  NOTIFICATIONS: "notifications",
  SWIPES: "swipes",
} as const;
