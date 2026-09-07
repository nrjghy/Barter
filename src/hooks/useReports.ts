import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { ReportService } from "../services";
import type { CreateReportData } from "../services/reportService";

export const useReports = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get user reports (reports made by the user)
  const {
    data: reportsData,
    isLoading: reportsLoading,
    error: reportsError,
  } = useQuery({
    queryKey: ["reports", user?.id],
    queryFn: () => ReportService.getUserReports(user!.id),
    enabled: !!user,
  });

  // Get reports against user (admin function)
  const {
    data: reportsAgainstUserData,
    isLoading: reportsAgainstUserLoading,
    error: reportsAgainstUserError,
  } = useQuery({
    queryKey: ["reportsAgainstUser", user?.id],
    queryFn: () => ReportService.getReportsAgainstUser(user!.id),
    enabled: !!user,
  });

  // Get report statistics
  const {
    data: reportStatsData,
    isLoading: reportStatsLoading,
    error: reportStatsError,
  } = useQuery({
    queryKey: ["reportStats"],
    queryFn: () => ReportService.getReportStats(),
  });

  // Create report mutation
  const createReport = useMutation({
    mutationFn: ({ reportData }: { reportData: CreateReportData }) => ReportService.createReport(reportData, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["reports", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["reportStats"] });
    },
  });

  // Update report status (admin function)
  const updateReport = useMutation({
    mutationFn: ({ reportId, updateData }: { reportId: string; updateData: any }) =>
      ReportService.updateReport(reportId, updateData, user!.id),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["reports", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["reportsAgainstUser", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["reportStats"] });
    },
  });

  // Check if user can report an item
  const canReportItem = async (itemId: string) => {
    if (!user) return false;
    const result = await ReportService.canReportItem(itemId, user.id);
    return result.data || false;
  };

  return {
    // Reports made by user
    reports: reportsData?.data || [],
    reportsLoading,
    reportsError: reportsError?.message,

    // Reports against user
    reportsAgainstUser: reportsAgainstUserData?.data || [],
    reportsAgainstUserLoading,
    reportsAgainstUserError: reportsAgainstUserError?.message,

    // Report statistics
    reportStats: reportStatsData?.data,
    reportStatsLoading,
    reportStatsError: reportStatsError?.message,

    // Actions
    createReport: (reportData: CreateReportData) => createReport.mutateAsync({ reportData }),
    createReportLoading: createReport.isPending,
    createReportError: createReport.error?.message,

    updateReport: updateReport.mutate,
    updateReportLoading: updateReport.isPending,
    updateReportError: updateReport.error?.message,

    canReportItem,
  };
};
