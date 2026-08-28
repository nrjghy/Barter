import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';
import { LocationPrompt } from './LocationPrompt';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    // Remember where they were headed so Login/AuthCallback can send
    // them back here after signing in, instead of always landing on the
    // default post-login destination.
    const destination = location.pathname + location.search;
    if (destination !== '/login') {
      sessionStorage.setItem('barter_redirect_after_login', destination);
    }
    return <Navigate to="/login" replace />;
  }

  if (user.latitude == null) {
    return <LocationPrompt />;
  }

  return <>{children}</>;
};
