import React, { useState, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Tag, Clock, MoreVertical, Flag, Heart, X, Star, Eye, Share2, Bookmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ItemWithUser } from '../hooks/useItems';
import { ReportDialog } from './ReportDialog';

interface EnhancedItemCardProps {
  item: ItemWithUser;
  onSwipe?: (direction: 'left' | 'right') => void;
  showActions?: boolean;
  variant?: 'default' | 'compact' | 'featured';
}

export const EnhancedItemCard: React.FC<EnhancedItemCardProps> = memo(({ 
  item, 
  onSwipe, 
  showActions = false,
  variant = 'default'
}) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const formattedDate = React.useMemo(() => {
    return new Date(item.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }, [item.created_at]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  }, [showMenu]);

  const handleReportClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowReportDialog(true);
    setShowMenu(false);
  }, []);

  const handleBookmark = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBookmarked(!isBookmarked);
    setShowMenu(false);
  }, [isBookmarked]);

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: item.description,
        url: window.location.href,
      });
    }
    setShowMenu(false);
  }, [item]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    navigate(`/item/${item.id}`);
  }, [navigate, item.id]);

  const handleDragEnd = useCallback((_, info) => {
    if (!onSwipe) return;
    
    if (info.offset.x > 100) {
      onSwipe('right');
    } else if (info.offset.x < -100) {
      onSwipe('left');
    }
  }, [onSwipe]);

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'Like New': return 'bg-green-100 text-green-800 border-green-200';
      case 'Very Good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Good': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Fair': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Poor': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const cardClasses = variant === 'compact' 
    ? 'bg-white rounded-xl shadow-md overflow-hidden cursor-grab active:cursor-grabbing relative'
    : variant === 'featured'
    ? 'bg-white rounded-3xl shadow-xl overflow-hidden cursor-grab active:cursor-grabbing relative border-2 border-gradient-to-r from-pink-200 to-purple-200'
    : 'bg-white rounded-2xl shadow-lg overflow-hidden cursor-grab active:cursor-grabbing relative';

  return (
    <>
      <motion.div
        className={cardClasses}
        drag={onSwipe ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        onDragEnd={onSwipe ? handleDragEnd : undefined}
        onClick={handleCardClick}
        whileHover={{ scale: 1.02, y: -4 }}
        whileTap={{ scale: 0.98 }}
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="relative">
          <div className={`${variant === 'compact' ? 'aspect-[3/2]' : 'aspect-[4/3]'} bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative overflow-hidden`}>
            {item.image_url && item.image_url.trim() !== '' ? (
              <>
                {!imageLoaded && (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 animate-pulse" />
                )}
                <img
                  src={item.image_url}
                  alt={item.title}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                  loading="lazy"
                  onLoad={() => setImageLoaded(true)}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    setImageLoaded(true);
                  }}
                />
              </>
            ) : (
              <div className="w-full h-full bg-gray-100" />
            )}
            
            {/* Gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
          </div>
          
          {/* Top badges and actions */}
          <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
            <div className="flex flex-wrap gap-2">
              <div className={`px-3 py-1 rounded-full text-sm font-medium border backdrop-blur-sm ${getConditionColor(item.condition)}`}>
                {item.condition}
              </div>
              {(item.price || item.estimated_value) && (
                <div className="bg-green-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm font-bold">
                  ${item.price || item.estimated_value}
                  {item.estimated_value && !item.price && (
                    <span className="text-xs opacity-75 ml-1">est.</span>
                  )}
                </div>
              )}
              {item.users.is_demo && (
                <div className="bg-blue-500/90 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs font-bold">
                  DEMO
                </div>
              )}
            </div>
            
            {showActions && (
              <div className="relative">
                <button
                  onClick={handleMenuClick}
                  className="w-8 h-8 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition-colors shadow-sm"
                >
                  <MoreVertical className="w-4 h-4 text-gray-600" />
                </button>
                
                <AnimatePresence>
                  {showMenu && (
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
                        <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current text-purple-600' : 'text-gray-600'}`} />
                        <span>{isBookmarked ? 'Saved' : 'Save'}</span>
                      </button>
                      <button
                        onClick={handleShare}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        <Share2 className="w-4 h-4 text-gray-600" />
                        <span>Share</span>
                      </button>
                      <button
                        onClick={handleReportClick}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-left hover:bg-gray-50 transition-colors text-red-600"
                      >
                        <Flag className="w-4 h-4" />
                        <span>Report</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Swipe indicators for dashboard */}
          {onSwipe && (
            <>
              <motion.div 
                className="absolute left-4 top-1/2 transform -translate-y-1/2 opacity-0 pointer-events-none"
                initial={{ opacity: 0, scale: 0.8 }}
              >
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                  <X className="w-8 h-8 text-white" />
                </div>
              </motion.div>
              <motion.div 
                className="absolute right-4 top-1/2 transform -translate-y-1/2 opacity-0 pointer-events-none"
                initial={{ opacity: 0, scale: 0.8 }}
              >
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                  <Heart className="w-8 h-8 text-white" />
                </div>
              </motion.div>
            </>
          )}

          {/* View count indicator */}
          <div className="absolute bottom-4 right-4">
            <div className="flex items-center space-x-1 bg-black/50 backdrop-blur-sm text-white px-2 py-1 rounded-full text-xs">
              <Eye className="w-3 h-3" />
              <span>{Math.floor(Math.random() * 50) + 10}</span>
            </div>
          </div>
        </div>
        
        <div className={`${variant === 'compact' ? 'p-4' : 'p-6'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h3 className={`${variant === 'compact' ? 'text-lg' : 'text-xl'} font-bold text-gray-900 mb-1 line-clamp-1`}>
                {item.title}
              </h3>
              <p className="text-purple-600 font-medium text-sm">{item.category}</p>
            </div>
            <div className="flex items-center text-gray-500 text-sm ml-4">
              <Clock className="w-4 h-4 mr-1" />
              {formattedDate}
            </div>
          </div>
          
          {item.description && variant !== 'compact' && (
            <p className="text-gray-600 mb-4 line-clamp-2 text-sm leading-relaxed">
              {item.description}
            </p>
          )}
          
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              {item.users.avatar_url ? (
                <img
                  src={item.users.avatar_url}
                  alt={item.users.username}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-100"
                />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center ring-2 ring-purple-100">
                  <span className="text-white font-bold text-sm">
                    {item.users.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{item.users.username}</p>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  {item.users.location && (
                    <div className="flex items-center">
                      <MapPin className="w-3 h-3 mr-1" />
                      <span className="truncate">{item.users.location}</span>
                    </div>
                  )}
                  {item.users.rating && (
                    <div className="flex items-center">
                      <Star className="w-3 h-3 mr-1 fill-current text-yellow-400" />
                      <span>{item.users.rating}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.tags.slice(0, variant === 'compact' ? 2 : 3).map((tag, index) => (
                <span
                  key={index}
                  className="bg-purple-50 text-purple-700 px-2 py-1 rounded-full text-xs font-medium border border-purple-100"
                >
                  #{tag}
                </span>
              ))}
              {item.tags.length > (variant === 'compact' ? 2 : 3) && (
                <span className="text-gray-500 text-xs py-1">
                  +{item.tags.length - (variant === 'compact' ? 2 : 3)} more
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Click outside to close menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowMenu(false)}
        />
      )}

      <ReportDialog
        isOpen={showReportDialog}
        onClose={() => setShowReportDialog(false)}
        item={item}
      />
    </>
  );
});

EnhancedItemCard.displayName = 'EnhancedItemCard';