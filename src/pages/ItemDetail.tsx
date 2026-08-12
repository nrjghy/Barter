import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Share2,
  MapPin,
  Calendar,
  Tag,
  Star,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Flag,
  Pencil,
  Clock,
  Package,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useResponses } from "../hooks/useResponses";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { ReportDialog } from "../components/ReportDialog";
import { ItemService, ItemWithUser } from "../services/itemService";
import toast from "react-hot-toast";
import { trackEvent } from "../lib/analytics";
import { shareItem } from "../utils/share";

export const ItemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { recordResponse } = useResponses();

  const [item, setItem] = useState<ItemWithUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [stillAvailableConfirmed, setStillAvailableConfirmed] = useState(false);
  const [confirmingStillAvailable, setConfirmingStillAvailable] = useState(false);

  // Get images from the item data
  const itemImages = item?.imageUrls && item.imageUrls.length > 0 ? item.imageUrls : [];

  useEffect(() => {
    if (id) {
      fetchItem();
    }
  }, [id]);

  const fetchItem = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("items")
        .select(
          `
          *,
          users!inner (
            id,
            username,
            location,
            avatar_url,
            rating,
            created_at
          )
        `
        )
        .eq("id", id)
        .eq("is_active", true)
        .single();

      if (error) throw error;

      // Transform the data to match ItemWithUser interface
      const transformedItem: ItemWithUser = {
        ...data,
        imageUrls: data.image_urls || [],
        userId: data.user_id,
        isActive: data.is_active,
        estimatedValue: data.estimated_value,
        valueCurrency: data.value_currency,
        sourceUrl: data.source_url,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        inactivityReminderSentAt: data.inactivity_reminder_sent_at,
        user: {
          id: data.users.id,
          username: data.users.username,
          email: "", // Not provided in the query
          location: data.users.location,
          avatarUrl: data.users.avatar_url,
          role: "user", // Default role
          rating: data.users.rating,
          totalRatings: null,
        },
      };

      setItem(transformedItem);
      // PRD §17 core conversion funnel, step 2: item detail view.
      trackEvent("item_detail_viewed", { itemId: transformedItem.id });
    } catch (error) {
      console.error("Error fetching item:", error);
      setError("Failed to load item details");
    } finally {
      setLoading(false);
    }
  };

  const handleSwipe = async (direction: "pass" | "like") => {
    if (!item || !user) return;

    const { error } = await recordResponse({ itemId: item.id, direction });

    if (error) {
      toast.error("Failed to record action");
      return;
    }

    if (direction === "like") {
      toast.success("Liked! 💖");
      // PRD §17 core conversion funnel, step 3: Like -- same event name as
      // Discover's handleSwipe, since a like from either entry point should
      // roll into the same funnel metric.
      trackEvent("item_liked", { itemId: item.id });
    } else {
      toast.success("Passed");
    }

    // Navigate back to discover after action
    setTimeout(() => navigate("/"), 1000);
  };

  const handleShare = async () => {
    if (item) {
      await shareItem(item);
    }
    setShowMoreMenu(false);
  };

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked);
    toast.success(isBookmarked ? "Removed from saved" : "Saved to bookmarks");
    setShowMoreMenu(false);
  };

  const handleConfirmStillAvailable = async () => {
    if (!item) return;

    setConfirmingStillAvailable(true);
    try {
      const { error } = await ItemService.confirmStillAvailable(item.id);
      if (error) {
        toast.error(error.message || "Couldn't confirm this listing. Please try again.");
        return;
      }
      // Confirming doesn't clear inactivityReminderSentAt server-side (the
      // cron jobs key off updated_at vs. it, not a null check) -- so we
      // just hide the banner locally rather than refetching the item.
      setStillAvailableConfirmed(true);
      toast.success("Thanks — marked as still available");
    } catch {
      toast.error("Couldn't confirm this listing. Please try again.");
    } finally {
      setConfirmingStillAvailable(false);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev === itemImages.length - 1 ? 0 : prev + 1));
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? itemImages.length - 1 : prev - 1));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Like New":
        return "bg-green-100 text-green-800 border-green-200";
      case "Good":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "Used":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "Worn":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600">Loading item details...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Item Not Found</h3>
          <p className="text-gray-600 mb-4">{error || "This item may have been removed or is no longer available."}</p>
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 bg-barter-600 text-white rounded-lg hover:bg-barter-700 transition-colors"
          >
            Back to Discover
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-gray-50"
    >
      <BackBar
        title={item.title}
        onBack={() => navigate("/")}
        action={
          <div className="flex items-center space-x-2 flex-shrink-0">
            <button onClick={handleShare} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Share2 className="w-5 h-5" />
            </button>

            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-lg border py-2 min-w-[160px] z-20"
                  >
                    {user?.id === item.userId ? (
                      <button
                        onClick={() => {
                          setShowMoreMenu(false);
                          navigate(`/edit/${item.id}`);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-gray-600" />
                        <span>Edit</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={handleBookmark}
                          className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                        >
                          <Bookmark
                            className={`w-4 h-4 ${isBookmarked ? "fill-current text-barter-600" : "text-gray-600"}`}
                          />
                          <span>{isBookmarked ? "Saved" : "Save"}</span>
                        </button>
                        <button
                          onClick={() => {
                            setShowReportDialog(true);
                            setShowMoreMenu(false);
                          }}
                          className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors text-red-600"
                        >
                          <Flag className="w-4 h-4" />
                          <span>Report</span>
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        }
      />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {/* Main Image */}
            <div className="relative aspect-square bg-gray-200 rounded-2xl overflow-hidden">
              {itemImages.length > 0 ? (
                <>
                  <img
                    src={itemImages[currentImageIndex]}
                    alt={item.title}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      imageLoading ? "opacity-0" : "opacity-100"
                    }`}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                  />
                  {imageLoading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LoadingSpinner />
                    </div>
                  )}

                  {/* Navigation Arrows */}
                  {itemImages.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-lg"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-lg"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}

                  {/* Image Counter */}
                  {itemImages.length > 1 && (
                    <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
                      {currentImageIndex + 1} / {itemImages.length}
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <Package className="w-16 h-16 text-gray-400" />
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col space-y-2">
                {item.listingType === "giveaway" && (
                  <div className="px-3 py-1 rounded-full text-sm font-medium bg-barter-600 text-white">
                    Giveaway
                  </div>
                )}
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium border backdrop-blur-sm ${getConditionColor(
                    item.condition
                  )}`}
                >
                  {item.condition}
                </div>
              </div>
            </div>

            {/* Thumbnail Gallery */}
            {itemImages.length > 1 && (
              <div className="flex space-x-2 overflow-x-auto pb-2">
                {itemImages.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentImageIndex
                        ? "border-barter-600 ring-2 ring-barter-200"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <img src={image} alt={`${item.title} ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Item Details */}
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Title and Category */}
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{item.title}</h1>
              <div className="flex items-center space-x-3">
                <span className="bg-barter-100 text-barter-700 px-3 py-1 rounded-full text-sm font-medium">
                  {item.category}
                </span>
                <div className="flex items-center text-gray-500 text-sm">
                  <Clock className="w-4 h-4 mr-1" />
                  Listed {formatDate(item.createdAt)}
                </div>
              </div>
            </div>

            {/* Inactivity reminder banner (PRD §2) */}
            {user?.id === item.userId && item.inactivityReminderSentAt && !stillAvailableConfirmed && (
              <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">Still have this?</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Let us know it's still available, or this listing will be archived soon.
                    </p>
                    <button
                      onClick={handleConfirmStillAvailable}
                      disabled={confirmingStillAvailable}
                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium text-sm disabled:opacity-50"
                    >
                      {confirmingStillAvailable ? "Confirming…" : "Yes, still available"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            )}

            {/* Value Information */}
            {Boolean(item.estimatedValue) && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Value Information</h3>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold text-green-700">${item.estimatedValue}</span>
                    <span className="text-sm text-green-600">Estimated Value</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">This is the owner's estimated value for trade reference</p>
                </div>
              </div>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium border"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Seller Information */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Listed by</h3>
              <div className="flex items-start space-x-4">
                {item.user.avatarUrl ? (
                  <img
                    src={item.user.avatarUrl}
                    alt={item.user.username}
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-barter-100"
                  />
                ) : (
                  <div className="w-16 h-16 bg-barter-600 rounded-full flex items-center justify-center ring-2 ring-barter-100">
                    <span className="text-white font-bold text-xl">{item.user.username.charAt(0).toUpperCase()}</span>
                  </div>
                )}

                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 text-lg">{item.user.username}</h4>

                  <div className="flex items-center space-x-4 mt-2">
                    {item.user.rating && (
                      <div className="flex items-center space-x-1">
                        <Star className="w-4 h-4 fill-current text-yellow-400" />
                        <span className="font-medium">{item.user.rating}</span>
                        <span className="text-gray-500 text-sm">rating</span>
                      </div>
                    )}

                    {item.user.location && (
                      <div className="flex items-center space-x-1 text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm">{item.user.location}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-1 text-gray-500 text-sm mt-1">
                    <Calendar className="w-4 h-4" />
                    <span>Member since {formatDate(item.user.createdAt || item.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Source URL Section */}
            {item.sourceUrl && (
              <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Original Listing</h3>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-600 mb-2">This item was imported from an external source</p>
                    <p className="text-xs text-gray-500">Click to view the original listing for more details</p>
                  </div>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View Source</span>
                  </a>
                </div>
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <p className="text-xs text-blue-600 font-mono break-all">{item.sourceUrl}</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {user && user.id !== item.userId && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleSwipe("pass")}
                    className="flex items-center justify-center space-x-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    <span>Pass</span>
                  </button>
                  <button
                    onClick={() => handleSwipe("like")}
                    className="flex items-center justify-center space-x-2 py-3 bg-green-100 text-green-700 rounded-xl font-medium hover:bg-green-200 transition-colors"
                  >
                    <Heart className="w-4 h-4" />
                    <span>Like</span>
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Click outside to close menu */}
      {showMoreMenu && <div className="fixed inset-0 z-10" onClick={() => setShowMoreMenu(false)} />}

      <ReportDialog isOpen={showReportDialog} onClose={() => setShowReportDialog(false)} item={item} />
    </motion.div>
  );
};
