import * as Sentry from "@sentry/react";

// PRD §17: Sentry (free tier) for JS errors and page-load/Core Web Vitals
// performance -- the frontend half of the split monitoring approach (backend
// stays on Supabase's own built-in dashboard logs/metrics, already available
// with no additional setup).
//
// Requires VITE_SENTRY_DSN to be set -- until then this no-ops entirely
// rather than throwing, matching analytics.ts's convention for the same
// pre-real-keys situation.

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.log("VITE_SENTRY_DSN not set -- Sentry disabled until a real DSN is configured.");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Small pilot (10-15 people) -- capture everything rather than sample,
    // same philosophy as PostHog's unsampled session recording.
    tracesSampleRate: 1.0,
    // Browser-extension noise: injected scripts reject with plain objects
    // (no stack, no app network spans), e.g. JAVASCRIPT-REACT-2's
    // {Id, MethodName, ParamCount}. Substring match covers every Id/
    // MethodName/ParamCount variant. Kept narrow on purpose -- a blanket
    // non-Error-rejection filter could mask real bugs later.
    ignoreErrors: ["Object Not Found Matching Id"],
  });
}
