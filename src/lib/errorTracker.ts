// Minimal in-memory holder for the most recently captured Postgrest error,
// written by fetchWithPostgrestErrorReporting in src/lib/supabase.ts. Lets
// the "Report" action on a friendly error toast attach the matching Sentry
// event ID even though the toast itself only has the raw ServiceError, not
// the Sentry event that was captured for it.
//
// Per-session, per-page-load only -- no persistence, and intentionally a
// single slot rather than a history, since only the most recent capture is
// ever relevant to a "report what just happened" action.

export interface CapturedError {
  eventId?: string;
  code: string;
  message: string;
  timestamp: number;
}

let lastCapturedError: CapturedError | undefined;

export function recordCapturedError(error: CapturedError): void {
  lastCapturedError = error;
}

export function getLastCapturedError(): CapturedError | undefined {
  return lastCapturedError;
}
