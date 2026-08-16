import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Star, MapPin, Calendar, Package } from "lucide-react";
import { useUserItems } from "../hooks/useItems";
import { useIsBlockedEitherWay } from "../hooks/useUserBlocks";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { UserService, UserProfile } from "../services/userService";
import type { ItemData } from "../services/types";

// Read-only counterpart to MyStuff's ListingRow -- that component is built
// entirely around owner actions (Edit/Cancel/Relist, status badges) and
// isn't exported anyway, so this is a separate, simpler card rather than a
// generalization of it. Everything shown here is active by construction
// (see the filter in UserListings below), so no status badge is needed.
const ListingCard: React.FC<{ item: ItemData; onOpen: () => void }> = ({ item, onOpen }) => {
  const thumbnail = item.imageUrls?.[0];

  return (
    <button onClick={onOpen} className="text-left">
      <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-200">
        {thumbnail ? (
          <img src={thumbnail} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
        )}
        {item.listingType === "giveaway" && (
          <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-medium bg-barter-600 text-white">
            Giveaway
          </div>
        )}
      </div>
      <div className="mt-2">
        <div className="text-sm font-semibold text-gray-900 truncate">{item.title}</div>
        <div className="text-xs text-gray-500">{item.condition}</div>
      </div>
    </button>
  );
};

export const UserListings: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const { data: profileResult, isLoading: profileLoading } = useQuery({
    queryKey: ["userProfile", userId],
    queryFn: () => UserService.getUserProfile(userId!),
    enabled: !!userId,
  });
  const profile: UserProfile | undefined = profileResult?.data;

  // Someone else's id naturally returns just their active items -- items'
  // RLS only lets a non-owner see active rows (see useUserItems' own
  // comment in useItems.ts). Filtered again here anyway so this page still
  // only ever shows active listings if userId happens to be the viewer's
  // own id, where RLS additionally allows every status through.
  const { items, loading: itemsLoading } = useUserItems(userId);
  const activeListings = items.filter((item) => (item.status ?? "active") === "active");

  // Mirrors how Block already behaves everywhere else in this app (Chat
  // never tells the blocked party they've been blocked) -- a blocked
  // relationship gets the exact same empty state as a genuine
  // zero-listings user, no distinct messaging.
  const { isBlocked, loading: blockLoading } = useIsBlockedEitherWay(userId);

  const loading = profileLoading || itemsLoading || blockLoading;
  const visibleListings = isBlocked ? [] : activeListings;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-gray-50 pt-16">
      <BackBar title={profile?.username ?? "Listings"} onBack={() => navigate(-1)} />

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {profile && (
          <div className="bg-white rounded-2xl p-6 border border-gray-200">
            <div className="flex items-start space-x-4">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.username}
                  className="w-16 h-16 rounded-full object-cover ring-2 ring-barter-100"
                />
              ) : (
                <div className="w-16 h-16 bg-barter-600 rounded-full flex items-center justify-center ring-2 ring-barter-100">
                  <span className="text-white font-bold text-xl">{profile.username.charAt(0).toUpperCase()}</span>
                </div>
              )}

              <div className="flex-1">
                <h4 className="font-semibold text-gray-900 text-lg">{profile.username}</h4>

                <div className="flex items-center space-x-4 mt-2">
                  {profile.rating && (
                    <div className="flex items-center space-x-1">
                      <Star className="w-4 h-4 fill-current text-yellow-400" />
                      <span className="font-medium">{profile.rating}</span>
                      <span className="text-gray-500 text-sm">rating</span>
                    </div>
                  )}

                  {profile.location && (
                    <div className="flex items-center space-x-1 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm">{profile.location}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-1 text-gray-500 text-sm mt-1">
                  <Calendar className="w-4 h-4" />
                  <span>Member since {formatDate(profile.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="py-16 flex justify-center">
            <LoadingSpinner />
          </div>
        )}

        {!loading && visibleListings.length === 0 && (
          <div className="text-center py-10 text-sm font-semibold text-gray-500">No active listings right now.</div>
        )}

        {!loading && visibleListings.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {visibleListings.map((item) => (
              <ListingCard key={item.id} item={item} onOpen={() => navigate(`/item/${item.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
