import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AuthUser } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('useAuth: Hook mounted, starting session check.');
    // Get initial session
    const getSession = async () => {
      console.log('useAuth: getSession - Attempting to get Supabase session.');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('useAuth: getSession - Session data received:', session?.user?.email || 'No session user.');
      if (session?.user) {
        console.log('useAuth: getSession - Calling fetchUserProfile.');
        await fetchUserProfile(session.user);
        console.log('useAuth: getSession - fetchUserProfile completed.');
      }
      console.log('useAuth: getSession - Setting loading to false.');
      setLoading(false);
    };

    getSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('useAuth: onAuthStateChange - Event:', event, 'Session user:', session?.user?.email || 'No session user.');
      if (session?.user) {
        console.log('useAuth: onAuthStateChange - Calling fetchUserProfile.');
        await fetchUserProfile(session.user);
        console.log('useAuth: onAuthStateChange - fetchUserProfile completed.');
      } else {
        setUser(null);
      }
      console.log('useAuth: onAuthStateChange - Setting loading to false.');
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (authUser: User) => {
    try {
      console.log('useAuth: fetchUserProfile - Starting for user ID:', authUser.id);
      console.log('useAuth: fetchUserProfile - Before Supabase users query.');
      const { data, error } = await supabase
        .from('users')
        .select('*, role')
        .eq('id', authUser.id)
        .single();

      console.log('useAuth: fetchUserProfile - After Supabase users query, data:', data, 'error:', error);

      if (error) {
        console.error('Error fetching user profile:', error);
        // If user doesn't exist in users table, create them
        if (error.code === 'PGRST116') {
          console.log('User not found in users table, this might be expected for demo');
        }
        return;
      }

      console.log('useAuth: fetchUserProfile - User state updated.');
      setUser({
        id: authUser.id,
        email: authUser.email!,
        username: data.username,
        location: data.location || undefined,
        avatar_url: data.avatar_url || undefined,
        role: data.role || 'user',
      });
      console.log('useAuth: fetchUserProfile - Completed successfully.');
    } catch (error) {
      console.error('useAuth: fetchUserProfile - Error in try-catch:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithOAuth = async (provider: 'google' | 'facebook' | 'github') => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    return { data, error };
  };
  const signUp = async (email: string, password: string, username: string, location?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          location: location || '',
        },
      },
    });
    return { error };
  };

  const resendVerification = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    });
    return { error };
  };
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const updateProfile = async (updates: Partial<AuthUser>) => {
    if (!user) return { error: new Error('No user logged in') };

    try {
      // First check if user exists in users table
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // User doesn't exist in users table, create them first
        const { error: insertError } = await supabase
          .from('users')
          .insert([{
            id: user.id,
            username: updates.username || user.username,
            location: updates.location || user.location,
            avatar_url: updates.avatar_url || user.avatar_url,
          }]);

        if (insertError) {
          console.error('Error creating user profile:', insertError);
          return { error: insertError };
        }
      } else if (fetchError) {
        console.error('Error checking user existence:', fetchError);
        return { error: fetchError };
      }

      // Now update the user profile
      const { error } = await supabase
        .from('users')
        .update({
          username: updates.username,
          location: updates.location,
          avatar_url: updates.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (!error) {
        setUser({ ...user, ...updates });
      }

      return { error };
    } catch (error) {
      console.error('Unexpected error updating profile:', error);
      return { error: error instanceof Error ? error : new Error('Unknown error occurred') };
    }
  };

  return {
    user,
    loading,
    signIn,
    signInWithOAuth,
    signUp,
    resendVerification,
    signOut,
    updateProfile,
  };
};