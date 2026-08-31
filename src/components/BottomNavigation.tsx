import React, { useEffect, useRef, useState } from 'react';
import { Home, Package, MessageCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';

// Below this, always show the bar regardless of scroll direction.
const NEAR_TOP_THRESHOLD = 24;

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
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  // Reset to visible whenever the page changes -- new pages generally
  // start scrolled to the top, and we don't want a stale hidden state
  // carried over from the previous page's scroll position.
  useEffect(() => {
    setVisible(true);
    lastScrollY.current = window.scrollY;
  }, [location.pathname]);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        if (currentY <= NEAR_TOP_THRESHOLD || currentY < lastScrollY.current) {
          setVisible(true);
        } else if (currentY > lastScrollY.current) {
          setVisible(false);
        }
        lastScrollY.current = currentY;
        ticking = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 px-4 pb-safe transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-[150%]'
      }`}
    >
      <div className="max-w-md mx-auto mb-4 flex justify-around py-2 bg-white/90 backdrop-blur-lg rounded-full shadow-xl border border-barter-800/10 overflow-hidden">
        {baseNavItems.map(({ icon: Icon, label, path }) => {
          const isActive = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
          return (
            <motion.button
              key={path}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center space-y-1 px-2 py-2 rounded-xl transition-all duration-200 ${
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
