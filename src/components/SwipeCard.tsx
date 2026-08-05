import React, { useState, useRef } from "react";
import { motion, PanInfo, useMotionValue, useTransform } from "framer-motion";
import { Heart, X, MapPin, Clock, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ItemWithUser } from "../services/itemService";

interface SwipeCardProps {
  item: ItemWithUser;
  onSwipe: (direction: "pass" | "like") => void;
  style?: React.CSSProperties;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({ item, onSwipe, style }) => {
  const navigate = useNavigate();
  const [exitX, setExitX] = useState(0);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0, 1, 1, 1, 0]);

  // Transform for swipe indicators
  const leftIndicatorOpacity = useTransform(x, [-150, -50], [1, 0]);
  const rightIndicatorOpacity = useTransform(x, [50, 150], [0, 1]); // Changed from [1, 0] to [0, 1]

  const cardRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (_event: any, info: PanInfo) => {
    const threshold = 100;
    const velocity = info.velocity.x;
    const movement = info.offset.x;

    // Regular swipes
    if (movement > threshold || velocity > 500) {
      setExitX(1000);
      onSwipe("like");
    } else if (movement < -threshold || velocity < -500) {
      setExitX(-1000);
      onSwipe("pass");
    }
  };

  const formattedDate = new Date(item.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if currently dragging or clicking action buttons
    if ((e.target as HTMLElement).closest("button") || Math.abs(x.get()) > 10) {
      return;
    }
    navigate(`/item/${item.id}`);
  };

  return (
    <motion.div
      ref={cardRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{
        x,
        rotate,
        opacity,
        ...style,
      }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragEnd={handleDragEnd}
      animate={exitX !== 0 ? { x: exitX } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      onClick={handleCardClick}
    >
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden h-full relative">
        {/* Swipe Indicators */}
        <motion.div
          className="absolute top-8 left-8 z-10 bg-red-500 text-white px-4 py-2 rounded-full font-bold text-lg border-4 border-white shadow-lg"
          style={{ opacity: leftIndicatorOpacity }}
        >
          <X className="w-6 h-6" />
        </motion.div>

        <motion.div
          className="absolute top-8 right-8 z-10 bg-green-500 text-white px-4 py-2 rounded-full font-bold text-lg border-4 border-white shadow-lg"
          style={{ opacity: rightIndicatorOpacity }}
        >
          <Heart className="w-6 h-6" />
        </motion.div>

        {/* Image */}
        <div className="h-2/3 bg-gradient-to-br from-gray-100 to-gray-200 relative overflow-hidden">
          {item.imageUrls && item.imageUrls.length > 0 && item.imageUrls[0]?.trim() !== "" ? (
            <img src={item.imageUrls[0]} alt={item.title} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <div className="w-full h-full bg-gray-100" />
          )}

          {/* Condition Badge */}
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-1">
            <span className="text-sm font-medium text-gray-700">{item.condition}</span>
          </div>
        </div>

        {/* Content */}
        <div className="h-1/3 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 mb-1 line-clamp-1">{item.title}</h3>
                <p className="text-barter-600 font-medium">{item.category}</p>
              </div>
              <div className="flex items-center text-gray-500 text-sm ml-4">
                <Clock className="w-4 h-4 mr-1" />
                {formattedDate}
              </div>
            </div>

            {item.description && <p className="text-gray-600 text-sm line-clamp-2 mb-3">{item.description}</p>}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {item.user.avatarUrl ? (
                <img
                  src={item.user.avatarUrl}
                  alt={item.user.username}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 bg-barter-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{item.user.username.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div>
                <p className="font-medium text-gray-900">{item.user.username}</p>
                <div className="flex items-center space-x-2">
                  {item.user.location && (
                    <div className="flex items-center text-gray-500 text-xs">
                      <MapPin className="w-3 h-3 mr-1" />
                      {item.user.location}
                    </div>
                  )}
                  {item.user.rating && (
                    <div className="flex items-center text-gray-500 text-xs">
                      <Star className="w-3 h-3 mr-1 fill-current text-yellow-400" />
                      <span>{item.user.rating}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {item.tags.slice(0, 3).map((tag, index) => (
                <span key={index} className="bg-barter-100 text-barter-700 px-2 py-1 rounded-full text-xs font-medium">
                  #{tag}
                </span>
              ))}
              {item.tags.length > 3 && <span className="text-gray-500 text-xs">+{item.tags.length - 3} more</span>}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
