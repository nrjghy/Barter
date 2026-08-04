import React, { useState, memo, useCallback } from "react";
import { motion } from "framer-motion";
import { MapPin, Tag, Clock, MoreVertical, Flag, Heart, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ItemWithUser } from "../hooks/useItems";
import { ReportDialog } from "./ReportDialog";

interface ItemCardProps {
  item: ItemWithUser;
  onSwipe?: (direction: "left" | "right") => void;
  showActions?: boolean;
}

// Memoize component to prevent unnecessary re-renders
export const ItemCard: React.FC<ItemCardProps> = memo(({ item, onSwipe, showActions = false }) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);

  // Memoize date formatting
  const formattedDate = React.useMemo(() => {
    return new Date(item.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }, [item.created_at]);

  const handleMenuClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowMenu(!showMenu);
    },
    [showMenu]
  );

  const handleReportClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowReportDialog(true);
    setShowMenu(false);
  }, []);

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't navigate if clicking on action buttons
      if ((e.target as HTMLElement).closest("button")) {
        return;
      }
      navigate(`/item/${item.id}`);
    },
    [navigate, item.id]
  );

  const handleDragEnd = useCallback(
    (_, info) => {
      if (!onSwipe) return;

      if (info.offset.x > 100) {
        onSwipe("right");
      } else if (info.offset.x < -100) {
        onSwipe("left");
      }
    },
    [onSwipe]
  );

  return (
    <>
      <motion.div
        className="bg-white rounded-2xl shadow-lg overflow-hidden cursor-grab active:cursor-grabbing relative"
        drag={onSwipe ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={onSwipe ? handleDragEnd : undefined}
        onClick={handleCardClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        layout
      >
        <div className="relative">
          <div className="aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            {item.imageUrls && item.imageUrls.length > 0 && item.imageUrls[0]?.trim() !== "" ? (
              <img
                src={item.imageUrls[0]}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy" // Add lazy loading
                onError={(e) => {
                  // Fallback for broken images
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
          </div>

          <div className="absolute top-4 right-4 flex items-center space-x-2">
            <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1">
              <span className="text-sm font-medium text-gray-700">{item.condition}</span>
            </div>

            {showActions && (
              <div className="relative">
                <button
                  onClick={handleMenuClick}
                  className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-white transition-colors"
                >
                  <MoreVertical className="w-4 h-4 text-gray-600" />
                </button>

                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border py-2 min-w-[150px] z-10"
                  >
                    <button
                      onClick={handleReportClick}
                      className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors text-red-600"
                    >
                      <Flag className="w-4 h-4" />
                      <span>Report</span>
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </div>

          {/* Swipe indicators for dashboard */}
          {onSwipe && (
            <>
              <div className="absolute left-4 top-1/2 transform -translate-y-1/2 opacity-0 pointer-events-none">
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
                  <X className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 opacity-0 pointer-events-none">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
                  <Heart className="w-8 h-8 text-white" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">{item.title}</h3>
              <p className="text-barter-600 font-medium">{item.category}</p>
            </div>
            <div className="flex items-center text-gray-500 text-sm">
              <Clock className="w-4 h-4 mr-1" />
              {formattedDate}
            </div>
          </div>

          {item.description && <p className="text-gray-600 mb-4 line-clamp-2">{item.description}</p>}

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-barter-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">{item.user.username.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="font-medium text-gray-900">{item.user.username}</p>
                {item.user.location && (
                  <div className="flex items-center text-gray-500 text-sm">
                    <MapPin className="w-3 h-3 mr-1" />
                    {item.user.location}
                  </div>
                )}
              </div>
            </div>
          </div>

          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {item.tags.slice(0, 3).map((tag, index) => (
                <span key={index} className="bg-barter-100 text-barter-700 px-2 py-1 rounded-full text-xs font-medium">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Click outside to close menu */}
      {showMenu && <div className="fixed inset-0 z-5" onClick={() => setShowMenu(false)} />}

      <ReportDialog isOpen={showReportDialog} onClose={() => setShowReportDialog(false)} item={item} />
    </>
  );
});

ItemCard.displayName = "ItemCard";
