import React from 'react';
import { Home, Heart, Plus, MessageCircle, User, Download } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

const navItems = [
  { icon: Home, label: 'Discover', path: '/' },
  { icon: Heart, label: 'Matches', path: '/matches' },
  { icon: Plus, label: 'Add', path: '/add' },
  { icon: Download, label: 'Import', path: '/import' },
  { icon: MessageCircle, label: 'Messages', path: '/messages' },
  { icon: User, label: 'Profile', path: '/profile' },
];

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200/50 px-4 pb-safe shadow-lg">
      <div className="max-w-md mx-auto">
        <div className="flex justify-around py-2">
          {navItems.map(({ icon: Icon, label, path }) => {
            const isActive = location.pathname === path;
            return (
              <motion.button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center space-y-1 px-2 py-2 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'text-purple-600 bg-purple-50 shadow-sm'
                    : 'text-gray-600 hover:text-purple-600 hover:bg-gray-50'
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-2' : ''}`} />
                <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`} style={{ fontSize: '10px' }}>
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-purple-600 rounded-full"
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};