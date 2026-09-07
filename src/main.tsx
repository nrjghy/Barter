import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "./lib/analytics";
import { initSentry } from "./lib/sentry";
import { getReportErrorController } from "./contexts/ReportErrorContext";

// This boundary wraps the whole app, including ReportErrorProvider -- so if
// it ever actually catches something, that provider (and its owned
// IssueReportDialog) has already been unmounted along with everything else
// under `children`. openReport is tried first anyway (in case a future
// refactor moves this boundary lower in the tree, below the provider), but
// Sentry's own hosted report dialog is the real fallback here: it's a
// standalone widget injected outside React, so it still works when the
// entire React tree it would otherwise depend on is gone.
const handleReportClick = (error: unknown, eventId: string) => {
  const controller = getReportErrorController();
  if (controller) {
    controller.openReport({ message: error instanceof Error ? error.message : String(error), eventId });
    return;
  }
  Sentry.showReportDialog({ eventId });
};

// Both are no-ops until their respective env vars (VITE_POSTHOG_KEY,
// VITE_SENTRY_DSN) are set -- see src/lib/analytics.ts / src/lib/sentry.ts.
initAnalytics();
initSentry();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, eventId }) => (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <p>Something went wrong. Please refresh the page.</p>
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button onClick={() => window.location.reload()}>Refresh the page</button>
            <button onClick={() => handleReportClick(error, eventId)}>Report this</button>
          </div>
        </div>
      )}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
