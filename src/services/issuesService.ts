import { supabase } from "../lib/supabase";
import { ServiceResult, ServiceError } from "./types";
import { ERROR_CODES, ERROR_MESSAGES, TABLES } from "./config";
import { ValidationService } from "./validation";
import { storageService } from "./storageService";

export type IssueType = "bug" | "feature_request" | "general" | "other";

export interface IssueWithDetails {
  id: string;
  userId: string;
  title: string;
  description: string;
  issueType: IssueType;
  status: "open" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueData {
  title: string;
  description: string;
  issueType: IssueType;
  imageFiles?: File[];
}

export class IssuesService {
  /**
   * Create a new issue report, following itemService.createItem's
   * sequencing: insert the row first (without images) to get a real id,
   * then upload any attached images against that id, then update the
   * row's image_urls. priority is never set here -- it stays at the
   * schema default ('medium'), it's a triage field for whoever moderates,
   * not something a reporter picks for themselves.
   */
  static async createIssue(issueData: CreateIssueData, userId: string): Promise<ServiceResult<IssueWithDetails>> {
    try {
      const userIdError = ValidationService.validateUUID(userId);
      if (userIdError) return { error: userIdError };

      const validationError = this.validateIssueData(issueData);
      if (validationError) return { error: validationError };

      const { data, error } = await supabase
        .from(TABLES.ISSUES)
        .insert([
          {
            user_id: userId,
            title: issueData.title,
            description: issueData.description,
            issue_type: issueData.issueType,
          },
        ])
        .select()
        .single();

      if (error) {
        return {
          error: {
            code: ERROR_CODES.NETWORK_ERROR,
            message: "Failed to submit report",
            details: error,
          },
        };
      }

      let imageUrls: string[] = data.image_urls || [];

      if (issueData.imageFiles && issueData.imageFiles.length > 0) {
        try {
          const uploadedUrls = await Promise.all(
            issueData.imageFiles.map((file) => storageService.uploadIssueImage(file, userId, data.id))
          );

          const { error: updateError } = await supabase
            .from(TABLES.ISSUES)
            .update({ image_urls: uploadedUrls })
            .eq("id", data.id);

          if (!updateError) {
            imageUrls = uploadedUrls;
          }
        } catch (uploadError) {
          // Best-effort, matching createItem's convention: the report
          // itself is already created at this point, so an image
          // upload/update failure shouldn't be surfaced as if the whole
          // submission failed.
          console.error("Issue image upload failed:", uploadError);
        }
      }

      return {
        data: {
          id: data.id,
          userId: data.user_id,
          title: data.title,
          description: data.description,
          issueType: data.issue_type,
          status: data.status,
          priority: data.priority,
          imageUrls,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
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

  private static validateIssueData(issueData: CreateIssueData): ServiceError | null {
    const titleError = ValidationService.validateRequired(issueData.title, "Title");
    if (titleError) return titleError;

    const descriptionError = ValidationService.validateRequired(issueData.description, "Description");
    if (descriptionError) return descriptionError;

    const validIssueTypes: IssueType[] = ["bug", "feature_request", "general", "other"];
    if (!validIssueTypes.includes(issueData.issueType)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid issue type",
      };
    }

    return null;
  }
}
