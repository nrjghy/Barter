import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Heart,
  Share2,
  MessageCircle,
  MapPin,
  Calendar,
  Tag,
  Star,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Flag,
  Eye,
  Clock,
  Package,
  ExternalLink,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useSwipes } from "../hooks/useSwipes";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ReportDialog } from "../components/ReportDialog";
import { ItemWithUser } from "../services/itemService";
import toast from "react-hot-toast";
import { trackEvent } from "../lib/analytics";

export const ItemDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { recordSwipe } = useSwipes();

  const [item, setItem] = useState<ItemWithUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

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

  const handleSwipe = async (direction: "left" | "right") => {
    if (!item || !user) return;

    const { error } = await recordSwipe({ itemId: item.id, direction });

    if (error) {
      toast.error("Failed to record action");
      return;
    }

    if (direction === "right") {
      toast.success("Liked! 💖");
      // PRD §17 core conversion funnel, step 3: Like -- same event name as
      // Dashboard's handleSwipe, since a like from either entry point should
      // roll into the same funnel metric.
      trackEvent("item_liked", { itemId: item.id });
    } else {
      toast.success("Passed");
    }

    // Navigate back to discover after action
    setTimeout(() => navigate("/"), 1000);
  };

  const handleShare = async () => {
    const shareData = {
      title: item?.title,
      text: `Check out this item: ${item?.title}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
    setShowMoreMenu(false);
  };

  const handleBookmark = () => {
    setIsBookmarked(!isBookmarked);
    toast.success(isBookmarked ? "Removed from saved" : "Saved to bookmarks");
    setShowMoreMenu(false);
  };

  const handleContact = () => {
    if (!item || !user) return;

    // In a real app, this would create a match or direct message
    toast.success("Contact request sent!");
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
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Back</span>
          </button>

          <div className="flex items-center space-x-2">
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
                    <button
                      onClick={handleBookmark}
                      className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${isBookmarked ? "fill-current text-purple-600" : "text-gray-600"}`}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

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
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium border backdrop-blur-sm ${getConditionColor(
                    item.condition
                  )}`}
                >
                  {item.condition}
                </div>
                {item.estimatedValue && (
                  <div className="bg-green-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm font-bold">
                    ${item.estimatedValue}
                  </div>
                )}
              </div>

              {/* View Count */}
              <div className="absolute top-4 right-4">
                <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs">
                  <Eye className="w-3 h-3" />
                  <span>{Math.floor(Math.random() * 100) + 20}</span>
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
                        ? "border-purple-500 ring-2 ring-purple-200"
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
                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                  {item.category}
                </span>
                <div className="flex items-center text-gray-500 text-sm">
                  <Clock className="w-4 h-4 mr-1" />
                  Listed {formatDate(item.createdAt)}
                </div>
              </div>
            </div>

            {/* Description */}
            {item.description && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
                <p className="text-gray-700 leading-relaxed">{item.description}</p>
              </div>
            )}

            {/* Value Information */}
            {item.estimatedValue && (
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">About the Seller</h3>
              <div className="flex items-start space-x-4">
                {item.user.avatarUrl ? (
                  <img
                    src={item.user.avatarUrl}
                    alt={item.user.username}
                    className="w-16 h-16 rounded-full object-cover ring-2 ring-purple-100"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center ring-2 ring-purple-100">
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
                <button
                  onClick={handleContact}
                  className="w-full flex items-center justify-center space-x-2 py-4 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-semibold hover:from-pink-600 hover:to-purple-600 transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Contact Seller</span>
                </button>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleSwipe("left")}
                    className="flex items-center justify-center space-x-2 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    <span>Pass</span>
                  </button>
                  <button
                    onClick={() => handleSwipe("right")}
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
