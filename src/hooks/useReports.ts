import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface Report {
  id: string;
  reporter_id: string;
  reported_item_id: string;
  reported_user_id: string;
  reason: string;
  description: string | null;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
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
  { value: "inappropriate_content", label: "Inappropriate Content" },
  { value: "misleading_description", label: "Misleading Description" },
  { value: "prohibited_item", label: "Prohibited Item" },
  { value: "spam", label: "Spam" },
  { value: "fake_listing", label: "Fake Listing" },
  { value: "offensive_language", label: "Offensive Language" },
  { value: "copyright_violation", label: "Copyright Violation" },
  { value: "safety_concern", label: "Safety Concern" },
  { value: "other", label: "Other" },
] as const;

const fetchUserReports = async (userId: string) => {
  const { data, error } = await supabase
    .from("reports")
    .select(
      `
      *,
      reported_item:items(title, image_url),
      reported_user:users(username)
    `
    )
    .eq("reporter_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Report[];
};

const createReportFn = async ({ reportData, userId }: { reportData: CreateReportData; userId: string }) => {
  const { data, error } = await supabase
    .from("reports")
    .insert([
      {
        ...reportData,
        reporter_id: userId,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const useReports = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: reports = [],
    isLoading: loading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["reports", user?.id],
    queryFn: () => fetchUserReports(user!.id),
    enabled: !!user,
  });

  const createReport = useMutation({
    mutationFn: ({ reportData }: { reportData: CreateReportData }) => createReportFn({ reportData, userId: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports", user?.id] });
    },
  });

  // Check if the user has already reported this item
  const checkExistingReport = async (itemId: string) => {
    if (!user) return false;
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("id")
        .eq("reporter_id", user.id)
        .eq("reported_item_id", itemId)
        .in("status", ["pending", "reviewed"])
        .single();
      return !error && data;
    } catch (error) {
      return false;
    }
  };

  return {
    loading,
    reports,
    error,
    createReport: (reportData: CreateReportData) => createReport.mutateAsync({ reportData }),
    refetch,
    checkExistingReport,
  };
};
