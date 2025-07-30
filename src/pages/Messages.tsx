import React, { useState } from "react";
import { MessageCircle, Search, ArrowLeft } from "lucide-react";
import { useMatches, MatchWithItems } from "../hooks/useMatches";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { ChatInterface } from "../components/ChatInterface";
import { motion } from "framer-motion";

export const Messages: React.FC = () => {
  const { matches, loading, error } = useMatches();
  const { user } = useAuth();
  const [selectedMatch, setSelectedMatch] = useState<MatchWithItems | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-700 mb-2">Error</h2>
          <p className="text-red-600 mb-4">{error.message || "Failed to load matches."}</p>
        </div>
      </div>
    );
  }

  if (selectedMatch) {
    return (
      <div className="h-screen">
        <ChatInterface match={selectedMatch} onBack={() => setSelectedMatch(null)} />
      </div>
    );
  }

  const acceptedMatches = matches.filter((match) => match.status === "accepted");

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <Search className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {acceptedMatches.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No conversations yet</h3>
          <p className="text-gray-600">Messages from your matches will appear here</p>
        </div>
      ) : (
        <div className="space-y-4">
          {acceptedMatches.map((match) => {
            const otherUser = match.user_id_1 === user?.id ? match.user2 : match.user1;
            const currentUserItem = match.user_id_1 === user?.id ? match.item1 : match.item2;
            const otherUserItem = match.user_id_1 === user?.id ? match.item2 : match.item1;

            return (
              <motion.button
                key={match.id}
                onClick={() => setSelectedMatch(match)}
                className="w-full bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-all duration-200 text-left"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">{otherUser.username.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-gray-900">{otherUser.username}</h3>
                      <span className="text-xs text-gray-500">{new Date(match.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <span className="truncate">{currentUserItem.title}</span>
                      <span>↔</span>
                      <span className="truncate">{otherUserItem.title}</span>
                    </div>
                    <p className="text-sm text-green-600 mt-1">✓ Matched - Start chatting!</p>
                  </div>
                  <div className="flex space-x-2">
                    <div className="w-8 h-8 bg-gray-100 rounded overflow-hidden">
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
                    <div className="w-8 h-8 bg-gray-100 rounded overflow-hidden">
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
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
};
