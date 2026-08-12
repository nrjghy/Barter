import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Header } from './Header';
import { Toaster } from 'react-hot-toast';

const TOP_LEVEL_PATHS = ['/', '/my-stuff', '/chat'];

export const Layout: React.FC = () => {
  const location = useLocation();
  const isTopLevel = TOP_LEVEL_PATHS.includes(location.pathname);

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
            background: '#1F2937',
            color: '#F9FAFB',
            borderRadius: '12px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: { primary: '#16a34a', secondary: '#F9FAFB' },
            style: {
              background: '#1F2937',
              color: '#F9FAFB',
              borderRadius: '12px',
              padding: '12px 16px',
              borderLeft: '3px solid #16a34a',
            },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#F9FAFB' },
            style: {
              background: '#1F2937',
              color: '#F9FAFB',
              borderRadius: '12px',
              padding: '12px 16px',
              borderLeft: '3px solid #ef4444',
            },
          },
        }}
      />

      {isTopLevel && <Header />}

      <main className={isTopLevel ? 'pt-16 pb-20' : ''}>
        <Outlet />
      </main>

      {isTopLevel && <BottomNavigation />}
    </div>
  );
};