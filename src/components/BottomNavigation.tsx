import React from 'react';
import { Home, Package, MessageCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

// Final 3-tab layout from the approved nav-shell design (Discover / My
// Stuff / Chat). Profile lives behind the header avatar, and Admin console
// is reached from Profile's settings menu -- neither is a bottom-nav tab.
const baseNavItems = [
  { icon: Home, label: 'Discover', path: '/' },
  { icon: Package, label: 'My Stuff', path: '/my-stuff' },
  { icon: MessageCircle, label: 'Chat', path: '/chat' },
];

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-gray-200/50 px-4 pb-safe shadow-lg">
      <div className="max-w-md mx-auto">
        <div className="flex justify-around py-2">
          {baseNavItems.map(({ icon: Icon, label, path }) => {
            const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
            return (
              <motion.button
                key={path}
                onClick={() => navigate(path)}
                className={`flex flex-col items-center space-y-1 px-2 py-2 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'text-barter-600 bg-barter-100 shadow-sm'
                    : 'text-gray-600 hover:text-barter-600 hover:bg-gray-50'
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
                    className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-barter-600 rounded-full"
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
