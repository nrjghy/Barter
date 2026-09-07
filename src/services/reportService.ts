import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES, BUSINESS_RULES } from "./config";
import { ValidationService } from "./validation";
import { REPORT_REASONS } from "../types";

export interface ReportWithDetails {
  id: string;
  reporterId: string;
  reportedItemId?: string;
  reportedUserId: string;
  reason: string;
  description?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  reporter: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  reportedUser: {
    id: string;
    username: string;
    avatarUrl?: string;
  };
  reportedItem?: {
    id: string;
    title: string;
    imageUrl?: string;
  };
}

export interface CreateReportData {
  reportedItemId?: string;
  reportedUserId: string;
  reason: string;
  description?: string;
}

export interface UpdateReportData {
  status: "reviewed" | "resolved" | "dismissed";
  adminNotes?: string;
  resolvedBy?: string;
}

export interface ReportStats {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  dismissedReports: number;
  reportsByReason: Record<string, number>;
}

export class ReportService {
  /**
   * Create a new report
   */
  static async createReport(
    reportData: CreateReportData,
    reporterId: string
  ): Promise<ServiceResult<ReportWithDetails>> {
    try {
      // Validate input
      const validationError = this.validateReportData(reportData);
      if (validationError) {
        return { error: validationError };
      }

      const reporterIdError = ValidationService.validateUUID(reporterId);
      if (reporterIdError) {
        return { error: reporterIdError };
      }

      // Check if user has already reported this item (or, for an item-less
      // report, this same user)
      const existingReport = await this.getReportByItemAndUser({
        reporterId,
        reportedItemId: reportData.reportedItemId,
        reportedUserId: reportData.reportedUserId,
      });
      if (existingReport.data) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: reportData.reportedItemId ? "You have already reported this item" : "You have already reported this user",
          },
        };
      }

      // Check report limit per item -- this rule is per-item, so it doesn't
      // apply to a user-only report.
      if (reportData.reportedItemId) {
        const itemReportCount = await this.getItemReportCount(reportData.reportedItemId);
        if (itemReportCount.data && itemReportCount.data >= BUSINESS_RULES.report.maxReportsPerItem) {
          return {
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: "Maximum reports reached for this item",
            },
          };
        }
      }

      // Create the report
      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .insert([
          {
            reporter_id: reporterId,
            reported_item_id: reportData.reportedItemId ?? null,
            reported_user_id: reportData.reportedUserId,
            reason: reportData.reason,
            description: reportData.description,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to create report",
            details: error,
          },
        };
      }

      // Get the full report details
      const fullReport = await this.getReport(data.id);
      if (fullReport.error) {
        return { error: fullReport.error };
      }

      return { data: fullReport.data! };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get all reports for a user (reports they made)
   */
  static async getUserReports(userId: string): Promise<ServiceResult<ReportWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .select(
          `
          *,
          reporter:users!reporter_id (
            id,
            username,
            avatar_url
          ),
          reported_user:users!reported_user_id (
            id,
            username,
            avatar_url
          ),
          reported_item:items!reported_item_id (
            id,
            title,
            image_url
          )
        `
        )
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch user reports",
            details: error,
          },
        };
      }

      const transformedData: ReportWithDetails[] = data.map((report: any) => ({
        id: report.id,
        reporterId: report.reporter_id,
        reportedItemId: report.reported_item_id ?? undefined,
        reportedUserId: report.reported_user_id,
        reason: report.reason,
        description: report.description,
        status: report.status,
        adminNotes: report.admin_notes,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        resolvedAt: report.resolved_at,
        resolvedBy: report.resolved_by,
        reporter: {
          id: report.reporter.id,
          username: report.reporter.username,
          avatarUrl: report.reporter.avatar_url,
        },
        reportedUser: {
          id: report.reported_user.id,
          username: report.reported_user.username,
          avatarUrl: report.reported_user.avatar_url,
        },
        reportedItem: report.reported_item
          ? {
              id: report.reported_item.id,
              title: report.reported_item.title,
              imageUrl: report.reported_item.image_url,
            }
          : undefined,
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get reports against a user (admin function)
   */
  static async getReportsAgainstUser(userId: string): Promise<ServiceResult<ReportWithDetails[]>> {
    try {
      const uuidError = ValidationService.validateUUID(userId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .select(
          `
          *,
          reporter:users!reporter_id (
            id,
            username,
            avatar_url
          ),
          reported_user:users!reported_user_id (
            id,
            username,
            avatar_url
          ),
          reported_item:items!reported_item_id (
            id,
            title,
            image_url
          )
        `
        )
        .eq("reported_user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch reports against user",
            details: error,
          },
        };
      }

      const transformedData: ReportWithDetails[] = data.map((report: any) => ({
        id: report.id,
        reporterId: report.reporter_id,
        reportedItemId: report.reported_item_id ?? undefined,
        reportedUserId: report.reported_user_id,
        reason: report.reason,
        description: report.description,
        status: report.status,
        adminNotes: report.admin_notes,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        resolvedAt: report.resolved_at,
        resolvedBy: report.resolved_by,
        reporter: {
          id: report.reporter.id,
          username: report.reporter.username,
          avatarUrl: report.reporter.avatar_url,
        },
        reportedUser: {
          id: report.reported_user.id,
          username: report.reported_user.username,
          avatarUrl: report.reported_user.avatar_url,
        },
        reportedItem: report.reported_item
          ? {
              id: report.reported_item.id,
              title: report.reported_item.title,
              imageUrl: report.reported_item.image_url,
            }
          : undefined,
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get all pending reports (admin function)
   */
  static async getPendingReports(): Promise<ServiceResult<ReportWithDetails[]>> {
    try {
      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .select(
          `
          *,
          reporter:users!reporter_id (
            id,
            username,
            avatar_url
          ),
          reported_user:users!reported_user_id (
            id,
            username,
            avatar_url
          ),
          reported_item:items!reported_item_id (
            id,
            title,
            image_url
          )
        `
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch pending reports",
            details: error,
          },
        };
      }

      const transformedData: ReportWithDetails[] = data.map((report: any) => ({
        id: report.id,
        reporterId: report.reporter_id,
        reportedItemId: report.reported_item_id ?? undefined,
        reportedUserId: report.reported_user_id,
        reason: report.reason,
        description: report.description,
        status: report.status,
        adminNotes: report.admin_notes,
        createdAt: report.created_at,
        updatedAt: report.updated_at,
        resolvedAt: report.resolved_at,
        resolvedBy: report.resolved_by,
        reporter: {
          id: report.reporter.id,
          username: report.reporter.username,
          avatarUrl: report.reporter.avatar_url,
        },
        reportedUser: {
          id: report.reported_user.id,
          username: report.reported_user.username,
          avatarUrl: report.reported_user.avatar_url,
        },
        reportedItem: report.reported_item
          ? {
              id: report.reported_item.id,
              title: report.reported_item.title,
              imageUrl: report.reported_item.image_url,
            }
          : undefined,
      }));

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get a single report by ID
   */
  static async getReport(reportId: string): Promise<ServiceResult<ReportWithDetails>> {
    try {
      const uuidError = ValidationService.validateUUID(reportId);
      if (uuidError) {
        return { error: uuidError };
      }

      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .select(
          `
          *,
          reporter:users!reporter_id (
            id,
            username,
            avatar_url
          ),
          reported_user:users!reported_user_id (
            id,
            username,
            avatar_url
          ),
          reported_item:items!reported_item_id (
            id,
            title,
            image_url
          )
        `
        )
        .eq("id", reportId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return {
            error: {
              code: ERROR_CODES.ITEM_NOT_FOUND,
              message: "Report not found",
            },
          };
        }
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch report",
            details: error,
          },
        };
      }

      const transformedData: ReportWithDetails = {
        id: data.id,
        reporterId: data.reporter_id,
        reportedItemId: data.reported_item_id ?? undefined,
        reportedUserId: data.reported_user_id,
        reason: data.reason,
        description: data.description,
        status: data.status,
        adminNotes: data.admin_notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        resolvedAt: data.resolved_at,
        resolvedBy: data.resolved_by,
        reporter: {
          id: data.reporter.id,
          username: data.reporter.username,
          avatarUrl: data.reporter.avatar_url,
        },
        reportedUser: {
          id: data.reported_user.id,
          username: data.reported_user.username,
          avatarUrl: data.reported_user.avatar_url,
        },
        reportedItem: data.reported_item
          ? {
              id: data.reported_item.id,
              title: data.reported_item.title,
              imageUrl: data.reported_item.image_url,
            }
          : undefined,
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Update report status (admin function)
   */
  static async updateReport(
    reportId: string,
    updateData: UpdateReportData,
    adminId: string
  ): Promise<ServiceResult<ReportWithDetails>> {
    try {
      const reportIdError = ValidationService.validateUUID(reportId);
      const adminIdError = ValidationService.validateUUID(adminId);
      if (reportIdError) return { error: reportIdError };
      if (adminIdError) return { error: adminIdError };

      // Validate status
      const validStatuses = ["reviewed", "resolved", "dismissed"];
      if (!validStatuses.includes(updateData.status)) {
        return {
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Invalid report status",
          },
        };
      }

      // Update the report
      const updatePayload: any = {
        status: updateData.status,
        admin_notes: updateData.adminNotes,
        updated_at: new Date().toISOString(),
      };

      if (updateData.status === "resolved") {
        updatePayload.resolved_at = new Date().toISOString();
        updatePayload.resolved_by = updateData.resolvedBy || adminId;
      }

      const { data, error } = await supabase
        .from(TABLES.REPORTS)
        .update(updatePayload)
        .eq("id", reportId)
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to update report",
            details: error,
          },
        };
      }

      // Get the full report details
      const fullReport = await this.getReport(data.id);
      if (fullReport.error) {
        return { error: fullReport.error };
      }

      return { data: fullReport.data! };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Get report statistics
   */
  static async getReportStats(): Promise<ServiceResult<ReportStats>> {
    try {
      const { data, error } = await supabase.from(TABLES.REPORTS).select("status, reason");

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to fetch report statistics",
            details: error,
          },
        };
      }

      const totalReports = data.length;
      const pendingReports = data.filter((report) => report.status === "pending").length;
      const resolvedReports = data.filter((report) => report.status === "resolved").length;
      const dismissedReports = data.filter((report) => report.status === "dismissed").length;

      const reportsByReason = data.reduce((acc, report) => {
        acc[report.reason] = (acc[report.reason] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return {
        data: {
          totalReports,
          pendingReports,
          resolvedReports,
          dismissedReports,
          reportsByReason,
        },
      };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Check if user can report an item
   */
  static async canReportItem(itemId: string, userId: string): Promise<ServiceResult<boolean>> {
    try {
      const itemIdError = ValidationService.validateUUID(itemId);
      const userIdError = ValidationService.validateUUID(userId);
      if (itemIdError) return { error: itemIdError };
      if (userIdError) return { error: userIdError };

      // Check if user has already reported this item
      const existingReport = await this.getReportByItemAndUser({ reporterId: userId, reportedItemId: itemId });
      if (existingReport.data) {
        return { data: false };
      }

      // Check if item exists and is active
      const { data: item, error } = await supabase.from(TABLES.ITEMS).select("is_active").eq("id", itemId).single();

      if (error || !item || !item.is_active) {
        return { data: false };
      }

      return { data: true };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  /**
   * Private helper methods
   */
  private static validateReportData(reportData: CreateReportData): ServiceError | null {
    if (reportData.reportedItemId) {
      const itemIdError = ValidationService.validateUUID(reportData.reportedItemId);
      if (itemIdError) return itemIdError;
    }

    const userIdError = ValidationService.validateUUID(reportData.reportedUserId);
    if (userIdError) return userIdError;

    const reasonError = ValidationService.validateRequired(reportData.reason, "Reason");
    if (reasonError) return reasonError;

    const descriptionError = ValidationService.validateReportDescription(reportData.description);
    if (descriptionError) return descriptionError;

    const validReasons: string[] = REPORT_REASONS.map((r) => r.value);
    if (!validReasons.includes(reportData.reason)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid report reason",
      };
    }

    return null;
  }

  /**
   * Look up an existing report by the same reporter, for a duplicate check.
   * When reportedItemId is given, matches on that item (the per-item rule).
   * Otherwise this is a user-only report, so it matches on reportedUserId
   * with reported_item_id IS NULL instead -- an item-based report and a
   * user-only report against the same user are different complaints, so
   * they shouldn't collide.
   */
  private static async getReportByItemAndUser(params: {
    reporterId: string;
    reportedItemId?: string;
    reportedUserId?: string;
  }): Promise<ServiceResult<ReportWithDetails | null>> {
    try {
      let query = supabase
        .from(TABLES.REPORTS)
        .select(
          `
          *,
          reporter:users!reporter_id (
            id,
            username,
            avatar_url
          ),
          reported_user:users!reported_user_id (
            id,
            username,
            avatar_url
          ),
          reported_item:items!reported_item_id (
            id,
            title,
            image_url
          )
        `
        )
        .eq("reporter_id", params.reporterId);

      query = params.reportedItemId
        ? query.eq("reported_item_id", params.reportedItemId)
        : query.eq("reported_user_id", params.reportedUserId!).is("reported_item_id", null);

      const { data, error } = await query.single();

      if (error && error.code === "PGRST116") {
        return { data: null };
      }

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to check existing report",
            details: error,
          },
        };
      }

      const transformedData: ReportWithDetails = {
        id: data.id,
        reporterId: data.reporter_id,
        reportedItemId: data.reported_item_id ?? undefined,
        reportedUserId: data.reported_user_id,
        reason: data.reason,
        description: data.description,
        status: data.status,
        adminNotes: data.admin_notes,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        resolvedAt: data.resolved_at,
        resolvedBy: data.resolved_by,
        reporter: {
          id: data.reporter.id,
          username: data.reporter.username,
          avatarUrl: data.reporter.avatar_url,
        },
        reportedUser: {
          id: data.reported_user.id,
          username: data.reported_user.username,
          avatarUrl: data.reported_user.avatar_url,
        },
        reportedItem: data.reported_item
          ? {
              id: data.reported_item.id,
              title: data.reported_item.title,
              imageUrl: data.reported_item.image_url,
            }
          : undefined,
      };

      return { data: transformedData };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }

  private static async getItemReportCount(itemId: string): Promise<ServiceResult<number>> {
    try {
      const { count, error } = await supabase
        .from(TABLES.REPORTS)
        .select("*", { count: "exact", head: true })
        .eq("reported_item_id", itemId);

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to get item report count",
            details: error,
          },
        };
      }

      return { data: count || 0 };
    } catch (error) {
      return {
        error: {
          code: ERROR_CODES.UNKNOWN_ERROR,
          message: ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR],
          details: error,
        },
      };
    }
  }
}
