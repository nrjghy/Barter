import React, { useState } from 'react';
import { Bell, User, Menu, HelpCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useNotifications } from '../hooks/useNotifications';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { NotificationCenter } from './NotificationCenter';
import { IssueReportDialog } from './IssueReportDialog';
import { HelpSheet } from './HelpSheet';

const HELP_CONTENT: Record<string, { title: string; items: string[] }> = {
  '/': {
    title: 'Discover',
    items: [
      "Swipe or tap the heart/X to like or pass",
      "Switch to 'My groups' to browse privately",
      'Filter by category with the funnel icon',
    ],
  },
  '/my-stuff': {
    title: 'My Stuff',
    items: ['Tap + to list something new', 'Tap any listing to edit, relist, or check its status'],
  },
  '/chat': {
    title: 'Chat',
    items: [
      'Matches and group connections land here',
      'Tap a conversation to message, propose a trade, or mark it complete',
    ],
  },
  '/groups': {
    title: 'Groups',
    items: [
      "Create a group or manage the ones you're in",
      'Invite by username or share a link',
      'Moderators can help manage members',
    ],
  },
};

export const Header: React.FC = () => {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showHelpSheet, setShowHelpSheet] = useState(false);
  const helpContent = HELP_CONTENT[location.pathname] ?? HELP_CONTENT['/'];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-br from-barter-600 to-barter-700 shadow-lg">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
        <motion.div
          className="flex items-center space-x-3 cursor-pointer"
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="w-8 h-8 bg-white/15 rounded-full flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-sm">B</span>
          </div>
          <h1 className="text-xl font-bold text-white">
            Barter
          </h1>
        </motion.div>

        <div className="flex items-center space-x-2">
          <motion.button
            onClick={() => setShowHelpSheet(true)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Help"
          >
            <HelpCircle className="w-5 h-5 text-white" />
          </motion.button>

          <motion.button
            onClick={() => setShowNotifications(true)}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors relative"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Bell className="w-5 h-5 text-white" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 border-2 border-barter-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>

          <motion.button
            onClick={() => navigate('/profile')}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.username}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                <span className="text-barter-700 text-xs font-bold">
                  {user?.username?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </motion.button>
        </div>
      </div>

      <NotificationCenter
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
      />

      <HelpSheet
        isOpen={showHelpSheet}
        onClose={() => setShowHelpSheet(false)}
        title={helpContent.title}
        items={helpContent.items}
        onReportIssue={() => {
          setShowHelpSheet(false);
          setShowIssueDialog(true);
        }}
      />

      <IssueReportDialog isOpen={showIssueDialog} onClose={() => setShowIssueDialog(false)} />
    </header>
  );
};