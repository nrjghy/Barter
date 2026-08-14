export interface AuthUser {
  id: string;
  email: string;
  username: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  avatar_url?: string;
  role?: string;
  locationPromptDismissedAt?: string;
  discoverHintDismissedAt?: string;
  myStuffHintDismissedAt?: string;
  chatHintDismissedAt?: string;
  rating?: number;
  createdAt?: string;
  defaultCurrency?: string;
}

export type ProfileUpdate = Partial<Omit<AuthUser, "latitude" | "longitude">> & {
  latitude?: number | null;
  longitude?: number | null;
};

export interface ItemFormData {
  title: string;
  description: string;
  category: string;
  condition: string;
  tags: string[];
  image?: File;
}

export interface MatchNotification {
  id: string;
  item1: {
    id: string;
    title: string;
    image_url?: string;
  };
  item2: {
    id: string;
    title: string;
    image_url?: string;
  };
  user: {
    username: string;
    avatar_url?: string;
  };
  created_at: string;
}

export const ITEM_CATEGORIES = [
  "Books",
  "Toys & Games",
  "Electronics",
  "Clothing",
  "Home & Garden",
  "Sports & Outdoors",
  "Food & Meals",
  "Art & Crafts",
  "Music & Instruments",
  "Tools & Equipment",
  "Beauty & Health",
  "Collectibles",
  "Other",
] as const;

export const ITEM_CONDITIONS = ["Like New", "Good", "Used", "Worn"] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const REPORT_REASONS = [
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "misleading_description", label: "Misleading Description" },
  { value: "prohibited_item", label: "Prohibited Item" },
  { value: "spam", label: "Spam" },
  { value: "fake_listing", label: "Fake Listing" },
  { value: "offensive_language", label: "Offensive Language" },
  { value: "other", label: "Other" },
] as const;
