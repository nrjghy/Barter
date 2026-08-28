// Shared by Login.tsx and AuthCallback.tsx (email/password and OAuth both
// land here after establishing a session). Reads and clears the
// destination ProtectedRoute stored before bouncing an unauthenticated
// visitor to /login, so a deep link (a shared item, a chat, anything)
// actually lands where it was headed instead of always the default
// screen. sessionStorage rather than router state, since OAuth involves
// a full-page redirect to the provider and back, which router state
// doesn't survive. Falls back to "/" when nothing was stored, e.g.
// someone just visited /login directly with no prior destination.
export function consumeRedirectAfterLogin(): string {
  const stored = sessionStorage.getItem("barter_redirect_after_login");
  sessionStorage.removeItem("barter_redirect_after_login");
  return stored || "/";
}
