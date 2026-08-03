import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "./lib/analytics";
import { initSentry } from "./lib/sentry";

// Both are no-ops until their respective env vars (VITE_POSTHOG_KEY,
// VITE_SENTRY_DSN) are set -- see src/lib/analytics.ts / src/lib/sentry.ts.
initAnalytics();
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>Something went wrong. Please refresh the page.</p>
        </div>
      }
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
