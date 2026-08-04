import { VALIDATION_RULES, ERROR_CODES, ERROR_MESSAGES } from "./config";
import { ServiceError } from "./types";

export class ValidationService {
  /**
   * Validates username format and length
   */
  static validateUsername(username: string): ServiceError | null {
    if (!username || typeof username !== "string") {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Username is required",
      };
    }

    if (username.length < VALIDATION_RULES.username.minLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Username must be at least ${VALIDATION_RULES.username.minLength} characters long`,
      };
    }

    if (username.length > VALIDATION_RULES.username.maxLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Username must be no more than ${VALIDATION_RULES.username.maxLength} characters long`,
      };
    }

    if (!VALIDATION_RULES.username.pattern.test(username)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Username can only contain letters, numbers, and underscores",
      };
    }

    return null;
  }

  /**
   * Validates password format and length
   */
  static validatePassword(password: string): ServiceError | null {
    if (!password || typeof password !== "string") {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Password is required",
      };
    }

    if (password.length < VALIDATION_RULES.password.minLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Password must be at least ${VALIDATION_RULES.password.minLength} characters long`,
      };
    }

    if (password.length > VALIDATION_RULES.password.maxLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Password must be no more than ${VALIDATION_RULES.password.maxLength} characters long`,
      };
    }

    return null;
  }

  /**
   * Validates email format
   */
  static validateEmail(email: string): ServiceError | null {
    if (!email || typeof email !== "string") {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Email is required",
      };
    }

    if (!VALIDATION_RULES.email.pattern.test(email)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Please enter a valid email address",
      };
    }

    return null;
  }

  /**
   * Validates item title
   */
  static validateItemTitle(title: string): ServiceError | null {
    if (!title || typeof title !== "string") {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Item title is required",
      };
    }

    if (title.length < VALIDATION_RULES.itemTitle.minLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Item title cannot be empty",
      };
    }

    if (title.length > VALIDATION_RULES.itemTitle.maxLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Item title must be no more than ${VALIDATION_RULES.itemTitle.maxLength} characters long`,
      };
    }

    return null;
  }

  /**
   * Validates item description
   */
  static validateItemDescription(description: string): ServiceError | null {
    if (!description || typeof description !== "string") {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Item description is required",
      };
    }

    if (description.length < VALIDATION_RULES.itemDescription.minLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Item description cannot be empty",
      };
    }

    if (description.length > VALIDATION_RULES.itemDescription.maxLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Item description must be no more than ${VALIDATION_RULES.itemDescription.maxLength} characters long`,
      };
    }

    return null;
  }

  /**
   * Validates response direction
   */
  static validateResponseDirection(direction: string): ServiceError | null {
    const validDirections = ["pass", "like"] as const;

    if (!validDirections.includes(direction as any)) {
      return {
        code: ERROR_CODES.INVALID_RESPONSE_DIRECTION,
        message: ERROR_MESSAGES[ERROR_CODES.INVALID_RESPONSE_DIRECTION],
      };
    }

    return null;
  }

  /**
   * Validates rating value
   */
  static validateRating(rating: number): ServiceError | null {
    if (typeof rating !== "number" || isNaN(rating)) {
      return {
        code: ERROR_CODES.INVALID_RATING,
        message: "Rating must be a number",
      };
    }

    if (rating < VALIDATION_RULES.review.minRating || rating > VALIDATION_RULES.review.maxRating) {
      return {
        code: ERROR_CODES.INVALID_RATING,
        message: ERROR_MESSAGES[ERROR_CODES.INVALID_RATING],
      };
    }

    return null;
  }

  /**
   * Validates review comment length
   */
  static validateReviewComment(comment?: string): ServiceError | null {
    if (comment && comment.length > VALIDATION_RULES.reviewComment.maxLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Review comment must be no more than ${VALIDATION_RULES.reviewComment.maxLength} characters long`,
      };
    }

    return null;
  }

  /**
   * Validates report description length
   */
  static validateReportDescription(description?: string): ServiceError | null {
    if (description && description.length > VALIDATION_RULES.reportDescription.maxLength) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Report description must be no more than ${VALIDATION_RULES.reportDescription.maxLength} characters long`,
      };
    }

    return null;
  }

  /**
   * Validates UUID format
   */
  static validateUUID(uuid: string): ServiceError | null {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuid || typeof uuid !== "string" || !uuidPattern.test(uuid)) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Invalid UUID format",
      };
    }

    return null;
  }

  /**
   * Validates pagination parameters
   */
  static validatePagination(page: number, limit: number): ServiceError | null {
    if (typeof page !== "number" || page < 0) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Page number must be a non-negative number",
      };
    }

    if (typeof limit !== "number" || limit <= 0 || limit > 100) {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Limit must be a positive number between 1 and 100",
      };
    }

    return null;
  }

  /**
   * Validates required fields
   */
  static validateRequired(value: unknown, fieldName: string): ServiceError | null {
    if (value === null || value === undefined || value === "") {
      return {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `${fieldName} is required`,
      };
    }

    return null;
  }
}
