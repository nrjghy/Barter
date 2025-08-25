import React from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, X, Check, Package } from "lucide-react";
import { useMatches } from "../hooks/useMatches";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ReviewDialog } from "../components/ReviewDialog";
import toast from "react-hot-toast";
import { useReviews } from "../hooks/useReviews";

export const Matches: React.FC = () => {
  const { matches, loading, updateMatch } = useMatches();
  const { user } = useAuth();
  const { createReview, checkCanReview } = useReviews();
  const [selectedReview, setSelectedReview] = useState<{
    matchId: string;
    revieweeId: string;
    revieweeName: string;
  } | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);

  // Debug logging
  React.useEffect(() => {
    console.log("Matches component - user:", user?.id);
    console.log("Matches component - matches count:", matches.length);
    console.log("Matches component - all matches:", matches);
  }, [user, matches]);

  const handleReviewClick = (match: any) => {
    const isCurrentUserRequest = match.user_id_1 === user?.id;
    const otherUser = isCurrentUserRequest ? match.item2.user : match.item1.user;
    setSelectedReview({
      matchId: match.id,
      revieweeId: otherUser.id,
      revieweeName: otherUser.username,
    });
    setShowReviewDialog(true);
  };

  const handleUpdateMatch = async (matchId: string, status: "accepted" | "rejected") => {
    try {
      await updateMatch({ matchId, status });
      toast.success(status === "accepted" ? "Match accepted!" : "Match rejected");
    } catch (error) {
      toast.error("Failed to update match");
    }
  };

  const pendingMatches = matches.filter((match) => match.status === "pending");
  const acceptedMatches = matches.filter((match) => match.status === "accepted");

  // Debug logging for filtered matches
  React.useEffect(() => {
    console.log("Matches component - pending matches:", pendingMatches.length);
    console.log("Matches component - accepted matches:", acceptedMatches.length);
  }, [pendingMatches, acceptedMatches]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Matches</h1>
        <p className="text-gray-600">Your item exchange connections</p>
      </div>

      {/* Pending Matches */}
      {pendingMatches.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Pending Requests</h2>
          <div className="space-y-4">
            {pendingMatches.map((match) => {
              const isCurrentUserRequest = match.user_id_1 === user?.id;
              const otherUser = isCurrentUserRequest ? match.item2.user : match.item1.user;
              const currentUserItem = isCurrentUserRequest ? match.item1 : match.item2;
              const otherUserItem = isCurrentUserRequest ? match.item2 : match.item1;

              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {otherUser.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{otherUser.username}</p>
                        <p className="text-sm text-gray-600">
                          {isCurrentUserRequest ? "Sent request" : "Received request"}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">{new Date(match.created_at).toLocaleDateString()}</div>
                  </div>

                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex-1 text-center">
                      <div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden">
                        {currentUserItem.image_url && currentUserItem.image_url.trim() !== "" ? (
                          <img
                            src={currentUserItem.image_url}
                            alt={currentUserItem.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100" />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{currentUserItem.title}</p>
                      <p className="text-xs text-gray-600">Your item</p>
                    </div>

                    <div className="flex-shrink-0">
                      <Heart className="w-6 h-6 text-pink-500" />
                    </div>

                    <div className="flex-1 text-center">
                      <div className="aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden">
                        {otherUserItem.image_url && otherUserItem.image_url.trim() !== "" ? (
                          <img
                            src={otherUserItem.image_url}
                            alt={otherUserItem.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-100" />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900">{otherUserItem.title}</p>
                      <p className="text-xs text-gray-600">Their item</p>
                    </div>
                  </div>

                  {/* Simple Trade Description */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg text-center">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">{isCurrentUserRequest ? "You" : otherUser.username}</span> want to
                      trade <span className="font-medium">{currentUserItem.title}</span> for{" "}
                      <span className="font-medium">{otherUserItem.title}</span>
                    </p>
                  </div>

                  {!isCurrentUserRequest && (
                    <div className="flex space-x-3">
                      <button
                        onClick={() => handleUpdateMatch(match.id, "rejected")}
                        className="flex-1 flex items-center justify-center space-x-2 py-2 px-4 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        <span>Decline</span>
                      </button>
                      <button
                        onClick={() => handleUpdateMatch(match.id, "accepted")}
                        className="flex-1 flex items-center justify-center space-x-2 py-2 px-4 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                      >
                        <Check className="w-4 h-4" />
                        <span>Accept</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Accepted Matches */}
      {acceptedMatches.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Matches</h2>
          <div className="space-y-4">
            {acceptedMatches.map((match) => {
              const isCurrentUserRequest = match.user_id_1 === user?.id;
              const otherUser = isCurrentUserRequest ? match.item2.user : match.item1.user;

              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl shadow-sm p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {otherUser.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{otherUser.username}</p>
                        <p className="text-sm text-green-600">✓ Matched</p>
                      </div>
                    </div>
                    <button className="flex items-center space-x-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors">
                      <MessageCircle className="w-4 h-4" />
                      <span>Message</span>
                    </button>
                  </div>

                  {/* Review Button for Completed Trades */}
                  {match.completed_at && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleReviewClick(match)}
                        className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                      >
                        <span>⭐</span>
                        <span>Rate This Trade</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No matches yet</h3>
          <p className="text-gray-600">Start swiping to find items you'd like to exchange!</p>
        </div>
      )}

      {/* Review Dialog */}
      {selectedReview && (
        <ReviewDialog
          isOpen={showReviewDialog}
          onClose={() => {
            setShowReviewDialog(false);
            setSelectedReview(null);
          }}
          matchId={selectedReview.matchId}
          revieweeId={selectedReview.revieweeId}
          revieweeName={selectedReview.revieweeName}
        />
      )}
    </div>
  );
};
