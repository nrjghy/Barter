import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image, Smile, MoreVertical, ArrowLeft } from 'lucide-react';
import { useMessages, QUICK_RESPONSES } from '../hooks/useMessages';
import { useAuth } from '../hooks/useAuth';
import { MatchWithItems } from '../hooks/useMatches';
import { OfferedItemsDisplay } from './OfferedItemsDisplay';

interface ChatInterfaceProps {
  match: MatchWithItems;
  onBack: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ match, onBack }) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useMessages(match.id);
  const [newMessage, setNewMessage] = useState('');
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const otherUser = match.user_id_1 === user?.id ? match.user2 : match.user1;
  const currentUserItem = match.user_id_1 === user?.id ? match.item1 : match.item2;
  const otherUserItem = match.user_id_1 === user?.id ? match.item2 : match.item1;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (content: string, messageType: 'text' | 'template' = 'text') => {
    if (!content.trim()) return;

    await sendMessage(content, messageType);
    setNewMessage('');
    setShowQuickResponses(false);
  };

  const handleQuickResponse = (response: string) => {
    handleSendMessage(response, 'template');
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {otherUser.username.charAt(0).toUpperCase()}
            </span>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-900">{otherUser.username}</h3>
            <p className="text-sm text-green-600">✓ Matched</p>
          </div>
        </div>
        
        <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      {/* Match Info */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="flex items-center justify-center space-x-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-lg mb-2 overflow-hidden">
              {currentUserItem.image_url ? (
                <img
                  src={currentUserItem.image_url}
                  alt={currentUserItem.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
              )}
            </div>
            <p className="text-xs font-medium text-gray-900">{currentUserItem.title}</p>
            <p className="text-xs text-gray-600">Your item</p>
          </div>
          
          <div className="text-2xl">💝</div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-200 rounded-lg mb-2 overflow-hidden">
              {otherUserItem.image_url ? (
                <img
                  src={otherUserItem.image_url}
                  alt={otherUserItem.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">📦</div>
              )}
            </div>
            <p className="text-xs font-medium text-gray-900">{otherUserItem.title}</p>
            <p className="text-xs text-gray-600">Their item</p>
          </div>
        </div>
        
        {/* Trade Offers */}
        <div className="mt-4 space-y-3">
          {/* Current user's offered items */}
          {((match.user_id_1 === user?.id && match.user_id_1_offered_items_details) ||
            (match.user_id_2 === user?.id && match.user_id_2_offered_items_details)) && (
            <div className="bg-blue-50 rounded-lg p-3">
              <OfferedItemsDisplay
                items={match.user_id_1 === user?.id 
                  ? match.user_id_1_offered_items_details || []
                  : match.user_id_2_offered_items_details || []
                }
                title="You're offering:"
                emptyMessage="No additional items offered"
              />
            </div>
          )}
          
          {/* Other user's offered items */}
          {((match.user_id_1 === user?.id && match.user_id_2_offered_items_details) ||
            (match.user_id_2 === user?.id && match.user_id_1_offered_items_details)) && (
            <div className="bg-green-50 rounded-lg p-3">
              <OfferedItemsDisplay
                items={match.user_id_1 === user?.id 
                  ? match.user_id_2_offered_items_details || []
                  : match.user_id_1_offered_items_details || []
                }
                title={`${otherUser.username} is offering:`}
                emptyMessage="No additional items offered"
              />
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && messages.length === 0 ? (
          <div className="text-center text-gray-500">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">It's a Match!</h3>
            <p className="text-gray-600 mb-4">You both liked each other's items. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                  message.sender_id === user?.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900'
                } ${
                  message.message_type === 'template' ? 'border-2 border-dashed border-gray-300' : ''
                }`}
              >
                <p className="text-sm">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.sender_id === user?.id ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {new Date(message.created_at).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </p>
              </div>
            </motion.div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Responses */}
      <AnimatePresence>
        {showQuickResponses && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="p-4 bg-gray-50 border-t"
          >
            <div className="grid grid-cols-2 gap-2">
              {QUICK_RESPONSES.map((response, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickResponse(response)}
                  className="p-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  {response}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-4 border-t bg-white">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowQuickResponses(!showQuickResponses)}
            className={`p-2 rounded-lg transition-colors ${
              showQuickResponses ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'
            }`}
          >
            <Smile className="w-5 h-5" />
          </button>
          
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(newMessage)}
              placeholder="Type a message..."
              className="w-full px-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Image className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => handleSendMessage(newMessage)}
            disabled={!newMessage.trim()}
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};