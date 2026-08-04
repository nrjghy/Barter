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
    <div className="min-h-screen bg-gradient-to-br from-barter-50 via-barter-50 to-indigo-50">
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1F2937',
            color: '#F9FAFB',
            borderRadius: '12px',
            padding: '12px 16px',
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