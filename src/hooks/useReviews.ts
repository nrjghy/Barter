import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { Review } from '../types/database';

export interface ReviewWithUsers extends Review {
  reviewer: {
    username: string;
    avatar_url: string | null;
  };
  reviewee: {
    username: string;
    avatar_url: string | null;
  };
  match: {
    item1: { title: string };
    item2: { title: string };
  };
}

export interface CreateReviewData {
  match_id: string;
  reviewee_id: string;
  rating: number;
  comment?: string;
  trade_experience?: 'excellent' | 'good' | 'fair' | 'poor';
}

export const useReviews = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reviews, setReviews] = useState<ReviewWithUsers[]>([]);

  const createReview = async (reviewData: CreateReviewData) => {
    if (!user) return { error: new Error('No user logged in') };

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reviews')
        .insert([
          {
            ...reviewData,
            reviewer_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      // Create notification for the reviewee
      await supabase.rpc('create_notification', {
        p_user_id: reviewData.reviewee_id,
        p_type: 'review',
        p_title: 'New Review Received',
        p_content: `${user.username} left you a ${reviewData.rating}-star review`,
        p_data: { review_id: data.id, rating: reviewData.rating }
      });

      return { data, error: null };
    } catch (error) {
      console.error('Error creating review:', error);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const fetchUserReviews = useCallback(async (userId?: string) => {
    const targetUserId = userId || user?.id;
    if (!targetUserId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          reviewer:users!reviews_reviewer_id_fkey(username, avatar_url),
          reviewee:users!reviews_reviewee_id_fkey(username, avatar_url),
          match:matches(
            item1:items!matches_item_id_1_fkey(title),
            item2:items!matches_item_id_2_fkey(title)
          )
        `)
        .eq('reviewee_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data as ReviewWithUsers[]);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const checkCanReview = async (matchId: string, revieweeId: string) => {
    if (!user) return false;

    try {
      // Check if user already reviewed this match
      const { data: existingReview } = await supabase
        .from('reviews')
        .select('id')
        .eq('match_id', matchId)
        .eq('reviewer_id', user.id)
        .single();

      if (existingReview) return false;

      // Check if match is accepted and user is part of it
      const { data: match } = await supabase
        .from('matches')
        .select('status, user_id_1, user_id_2')
        .eq('id', matchId)
        .single();

      return match && 
             match.status === 'accepted' && 
             (match.user_id_1 === user.id || match.user_id_2 === user.id);
    } catch (error) {
      console.error('Error checking review eligibility:', error);
      return false;
    }
  };

  return {
    loading,
    reviews,
    createReview,
    fetchUserReviews,
    checkCanReview,
  };
};