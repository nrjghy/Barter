import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Header } from './Header';
import { Toaster } from 'react-hot-toast';
import { useNotificationToasts } from '../hooks/useNotifications';

const TOP_LEVEL_PATHS = ['/', '/my-stuff', '/chat'];

// Profile sub-tree: shows the bottom tab bar but keeps its own
// BackBar/padding, so it's tracked separately from TOP_LEVEL_PATHS rather
// than folded in. Groups is its own primary bottom-nav tab now, but /groups
// still needs to be listed here since it renders with BackBar/padding like
// the rest of this sub-tree, not as a top-level page.
const BOTTOM_NAV_PROFILE_PATHS = ['/profile', '/account', '/notification-settings', '/groups'];

export const Layout: React.FC = () => {
  const location = useLocation();
  const isTopLevel = TOP_LEVEL_PATHS.includes(location.pathname);
  const showBottomNav =
    isTopLevel ||
    BOTTOM_NAV_PROFILE_PATHS.includes(location.pathname) ||
    location.pathname.startsWith('/groups/');
  useNotificationToasts();

  return (
    <div className="min-h-screen bg-gradient-to-br from-barter-50 via-barter-100 to-barter-200 relative overflow-hidden">
      <div
        className="fixed -top-12 -right-10 w-36 h-36 rounded-full bg-barter-200 opacity-25 pointer-events-none blur-2xl"
        aria-hidden="true"
      />
      <div
        className="fixed -bottom-8 -left-5 w-24 h-24 rounded-full bg-barter-600 opacity-10 pointer-events-none blur-2xl"
        aria-hidden="true"
      />

      <Toaster
        position="top-center"
        containerStyle={{ top: 140 }}
        toastOptions={{
          duration: 3000,
          style: {
            background: '#FFFFFF',
            color: 'oklch(22% 0.02 100)',
            border: '1px solid oklch(92% 0.01 95)',
            borderRadius: '12px',
            padding: '12px 16px',
            boxShadow: '0 10px 15px -3px oklch(20% 0.02 100 / 0.1), 0 4px 6px -4px oklch(20% 0.02 100 / 0.1)',
          },
          success: {
            iconTheme: { primary: 'oklch(42% 0.1 148)', secondary: '#FFFFFF' },
            style: {
              background: '#FFFFFF',
              color: 'oklch(22% 0.02 100)',
              border: '1px solid oklch(92% 0.01 95)',
              borderRadius: '12px',
              padding: '12px 16px',
              boxShadow: '0 10px 15px -3px oklch(20% 0.02 100 / 0.1), 0 4px 6px -4px oklch(20% 0.02 100 / 0.1)',
              borderLeft: '3px solid oklch(42% 0.1 148)',
            },
          },
          error: {
            iconTheme: { primary: 'oklch(50% 0.15 30)', secondary: '#FFFFFF' },
            style: {
              background: '#FFFFFF',
              color: 'oklch(22% 0.02 100)',
              border: '1px solid oklch(92% 0.01 95)',
              borderRadius: '12px',
              padding: '12px 16px',
              boxShadow: '0 10px 15px -3px oklch(20% 0.02 100 / 0.1), 0 4px 6px -4px oklch(20% 0.02 100 / 0.1)',
              borderLeft: '3px solid oklch(50% 0.15 30)',
            },
          },
        }}
      />

      {isTopLevel && <Header />}

      <main className={isTopLevel ? 'pt-16 pb-20' : ''}>
        <Outlet />
      </main>

      {showBottomNav && <BottomNavigation />}
    </div>
  );
};