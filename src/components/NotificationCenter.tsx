import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Bell, X, Check, Trash2 } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { LoadingSpinner } from './LoadingSpinner';
import type { NotificationWithDetails } from '../services/notificationService';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const { notifications, notificationsLoading, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();

  // Tap-to-navigate is only wired up for review_reminder so far -- every
  // other type's tap behavior (just mark-as-read/delete, no navigation)
  // is a pre-existing, already-tracked gap ("wire up in-app + email
  // notifications"), not something this pass fixes.
  const handleNotificationClick = (notification: NotificationWithDetails) => {
    if (notification.type !== 'review_reminder') return;
    const tradeCompletionId = (notification.data as { trade_completion_id?: string } | undefined)?.trade_completion_id;
    if (!tradeCompletionId) return;
    onClose();
    navigate(`/trade-completion/${tradeCompletionId}/review`);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'match':
        return '💖';
      case 'message':
        return '💬';
      case 'trade_completed':
        return '✅';
      case 'review':
        return '⭐';
      case 'system':
        return '🔔';
      case 'item_unavailable':
        return '🚫';
      case 'issue_status':
        return '📋';
      case 'review_reminder':
        return '📝';
      case 'trade_dispute':
        return '⚠️';
      case 'listing_expiry_reminder':
        return '⏰';
      default:
        return '📢';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-16 px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-barter-100 rounded-full flex items-center justify-center">
                <Bell className="w-5 h-5 text-barter-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                {unreadCount > 0 && (
                  <p className="text-sm text-gray-600">{unreadCount} unread</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="text-sm text-barter-600 hover:text-barter-700 font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto max-h-96">
            {notificationsLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications</h3>
                <p className="text-gray-600">You're all caught up!</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-4 hover:bg-gray-50 transition-colors ${
                      !notification.isRead ? 'bg-barter-50' : ''
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="text-2xl flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div
                            className={`flex-1 ${notification.type === 'review_reminder' ? 'cursor-pointer' : ''}`}
                            onClick={() => handleNotificationClick(notification)}
                          >
                            <h4 className={`text-sm font-medium ${
                              !notification.isRead ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {notification.title}
                            </h4>
                            <p className="text-sm text-gray-600 mt-1">
                              {notification.content}
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              {formatTimeAgo(notification.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center space-x-1 ml-2">
                            {!notification.isRead && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="p-1 text-barter-600 hover:text-barter-700 transition-colors"
                                title="Mark as read"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notification.id)}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete notification"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    {!notification.isRead && (
                      <div className="absolute left-2 top-1/2 transform -translate-y-1/2 w-2 h-2 bg-barter-600 rounded-full" />
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};