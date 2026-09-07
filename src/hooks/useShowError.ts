import { useCallback } from "react";
import toast from "react-hot-toast";
import { showErrorToast } from "../utils/toast";
import { useReportError } from "../contexts/ReportErrorContext";
import { getLastCapturedError } from "../lib/errorTracker";
import type { ServiceError } from "../services/types";

/**
 * Composes showErrorToast + openReport + getLastCapturedError -- the
 * standard "friendly toast with a Report action" call, factored out since
 * it's the same three-way composition at every one of the raw-error call
 * sites this replaces. Components that don't render inside
 * ReportErrorProvider (there are none currently) would throw via
 * useReportError; every route this is used from is covered.
 */
export function useShowError(): (
  error: ServiceError | { message: string; code?: string },
  toastOptions?: Parameters<typeof toast.error>[1]
) => string {
  const { openReport } = useReportError();

  return useCallback(
    (error, toastOptions) =>
      showErrorToast(
        error,
        () => openReport({ message: error.message, code: error.code, eventId: getLastCapturedError()?.eventId }),
        toastOptions
      ),
    [openReport]
  );
}
