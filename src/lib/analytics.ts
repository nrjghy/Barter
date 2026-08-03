import posthog from "posthog-js";

// PRD §17: PostHog (free tier), two funnels tracked from launch, session
// recording enabled for all pilot users (not sampled). This module centralizes
// init + event tracking so call sites use trackEvent()/identifyUser() rather
// than importing posthog-js directly everywhere.
//
// Requires VITE_POSTHOG_KEY (and optionally VITE_POSTHOG_HOST) to be set --
// until then this no-ops entirely rather than throwing, so the app keeps
// working in any environment without real keys configured yet.
//
// Session recording itself also needs "Record user sessions" turned on once
// in the PostHog project's own dashboard settings -- that's a one-time manual
// step, not something this code can do; not setting disable_session_recording
// here is the code-side half of PRD §17's "recording enabled for all users."

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

let initialized = false;

export function initAnalytics(): void {
  if (!POSTHOG_KEY) {
    console.log("VITE_POSTHOG_KEY not set -- analytics disabled until a real key is configured.");
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
  });

  initialized = true;
}

export function trackEvent(eventName: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(eventName, properties);
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.identify(userId, traits);
}
