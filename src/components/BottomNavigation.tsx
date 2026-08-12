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
    <nav className="fixed bottom-0 left-0 right-0 px-4 pb-safe">
      <div className="max-w-md mx-auto mb-4 flex justify-around py-2 bg-white/90 backdrop-blur-lg rounded-full shadow-xl border border-barter-800/10 overflow-hidden">
        {baseNavItems.map(({ icon: Icon, label, path }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <motion.button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center space-y-1 px-2 py-2 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-br from-barter-600 to-barter-700 text-white'
                  : 'text-[oklch(45%_0.02_95)] hover:text-barter-600 hover:bg-gray-50'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-2' : ''}`} />
              <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`} style={{ fontSize: '10px' }}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
