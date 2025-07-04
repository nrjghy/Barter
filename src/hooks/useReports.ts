import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Report {
  id: string;
  reporter_id: string;
  reported_item_id: string;
  reported_user_id: string;
  reason: string;
  description: string | null;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateReportData {
  reported_item_id: string;
  reported_user_id: string;
  reason: string;
  description?: string;
}

export const REPORT_REASONS = [
  { value: 'inappropriate_content', label: 'Inappropriate Content' },
  { value: 'misleading_description', label: 'Misleading Description' },
  { value: 'prohibited_item', label: 'Prohibited Item' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake_listing', label: 'Fake Listing' },
  { value: 'offensive_language', label: 'Offensive Language' },
  { value: 'copyright_violation', label: 'Copyright Violation' },
  { value: 'safety_concern', label: 'Safety Concern' },
  { value: 'other', label: 'Other' },
] as const;

export const useReports = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  const createReport = async (reportData: CreateReportData) => {
    if (!user) return { error: new Error('No user logged in') };

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .insert([
          {
            ...reportData,
            reporter_id: user.id,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      console.error('Error creating report:', error);
      return { data: null, error };
    } finally {
      setLoading(false);
    }
  };

  const fetchUserReports = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          reported_item:items(title, image_url),
          reported_user:users(username)
        `)
        .eq('reporter_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingReport = async (itemId: string) => {
    if (!user) return false;

    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id')
        .eq('reporter_id', user.id)
        .eq('reported_item_id', itemId)
        .in('status', ['pending', 'reviewed'])
        .single();

      return !error && data;
    } catch (error) {
      return false;
    }
  };

  return {
    loading,
    reports,
    createReport,
    fetchUserReports,
    checkExistingReport,
  };
};