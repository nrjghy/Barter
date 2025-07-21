import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Send } from 'lucide-react';
import { useReviews } from '../hooks/useReviews';
import { LoadingSpinner } from './LoadingSpinner';
import toast from 'react-hot-toast';

interface ReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
  revieweeId: string;
  revieweeName: string;
}

const TRADE_EXPERIENCES = [
  { value: 'excellent', label: 'Excellent', color: 'text-green-600' },
  { value: 'good', label: 'Good', color: 'text-blue-600' },
  { value: 'fair', label: 'Fair', color: 'text-yellow-600' },
  { value: 'poor', label: 'Poor', color: 'text-red-600' },
] as const;

export const ReviewDialog: React.FC<ReviewDialogProps> = ({
  isOpen,
  onClose,
  matchId,
  revieweeId,
  revieweeName,
}) => {
  const { createReview, loading } = useReviews();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [tradeExperience, setTradeExperience] = useState<'excellent' | 'good' | 'fair' | 'poor' | ''>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    try {
      const { error } = await createReview({
        match_id: matchId,
        reviewee_id: revieweeId,
        rating,
        comment: comment.trim() || undefined,
        trade_experience: tradeExperience || undefined,
      });

      if (error) {
        toast.error('Failed to submit review');
      } else {
        toast.success('Review submitted successfully!');
        onClose();
        // Reset form
        setRating(0);
        setComment('');
        setTradeExperience('');
      }
    } catch (error) {
      toast.error('Failed to submit review');
    }
  };

  const handleClose = () => {
    onClose();
    setRating(0);
    setHoveredRating(0);
    setComment('');
    setTradeExperience('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Rate Your Trade</h2>
                <p className="text-sm text-gray-600">How was your experience with {revieweeName}?</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Star Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Overall Rating *
              </label>
              <div className="flex items-center space-x-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoveredRating(star)}
                    onMouseLeave={() => setHoveredRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        star <= (hoveredRating || rating)
                          ? 'text-yellow-400 fill-current'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {rating > 0 && (
                  <span>
                    {rating === 1 && 'Poor'}
                    {rating === 2 && 'Fair'}
                    {rating === 3 && 'Good'}
                    {rating === 4 && 'Very Good'}
                    {rating === 5 && 'Excellent'}
                  </span>
                )}
              </p>
            </div>

            {/* Trade Experience */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Trade Experience
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRADE_EXPERIENCES.map((experience) => (
                  <button
                    key={experience.value}
                    type="button"
                    onClick={() => setTradeExperience(experience.value)}
                    className={`p-3 text-sm font-medium rounded-lg border-2 transition-all ${
                      tradeExperience === experience.value
                        ? 'border-purple-300 bg-purple-50 text-purple-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {experience.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div>
              <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-2">
                Comment (Optional)
              </label>
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Share details about your trading experience..."
                maxLength={500}
              />
              <div className="text-xs text-gray-500 mt-1">
                {comment.length}/500 characters
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || rating === 0}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-lg hover:from-pink-600 hover:to-purple-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Review</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};