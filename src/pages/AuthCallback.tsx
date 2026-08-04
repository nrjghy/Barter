import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Auth callback error:', error);
          toast.error('Authentication failed. Please try again.');
          navigate('/login');
          return;
        }

        if (data.session) {
          toast.success('Successfully signed in!');
          navigate('/');
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error('Unexpected auth callback error:', error);
        toast.error('Something went wrong. Please try again.');
        navigate('/login');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-barter-50 via-barter-50 to-indigo-50">
      <div className="text-center">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
};