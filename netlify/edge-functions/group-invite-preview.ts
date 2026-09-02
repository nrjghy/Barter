// Public, unauthenticated metadata endpoint for shared group invite links
// (PRD §16: "opening the link shows a public, unauthenticated preview --
// group name and description only -- before sign-in is required"). Modeled
// directly on netlify/edge-functions/item-preview.ts, same reasoning: a
// messaging app fetches the shared URL server-side to build a link preview,
// and the raw SPA shell has no per-group Open Graph tags for it to read.
//
// This does not re-implement the invite link's validity rules (revoked,
// expired, use-limit reached). It calls the existing get_group_invite_preview
// RPC, which already encodes exactly those rules and is already granted to
// anon for this purpose -- one source of truth for "is this link still good"
// rather than a second copy of that logic living here.
//
// Requires the same Netlify environment variables already configured for
// item-preview (Site configuration > Environment variables, scoped to Edge
// Functions -- these are not visible to Vite's VITE_-prefixed build vars,
// and not the same store as Supabase's own Edge Function secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Logs any Supabase call failure explicitly -- item-preview didn't, and a
// systemic failure there was indistinguishable from an ordinary "not found"
// until the logs were checked and turned out to be empty. Not repeating that
// gap here.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPage(opts: { title: string; description: string; redirectUrl: string }): string {
  const safeTitle = escapeHtml(opts.title);
  const safeDescription = escapeHtml(opts.description);
  const safeRedirect = escapeHtml(opts.redirectUrl);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${safeRedirect}">
<script>window.location.replace(${JSON.stringify(opts.redirectUrl)});</script>
</head>
<body>
<p>Redirecting to Barter… <a href="${safeRedirect}">Tap here if you're not redirected</a>.</p>
</body>
</html>`;
}

export default async (req: Request) => {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const token = segments[segments.length - 1];
    // Deliberately NOT /join/${token}: this function is itself bound to
    // /join/:token (config.path below), so a redirect back to that same
    // path would route straight back through this function again --
    // infinite reload loop, found live via the actual invite link, never
    // reaching the SPA. /g/:token is a second client route rendering the
    // same GroupJoin page, not matched by this function's own path, so
    // the redirect actually lands in the app. See src/App.tsx's /g/:token
    // route comment for the other half of this fix. The public link
    // itself is unchanged -- still /join/:token, still what share.ts
    // generates -- only this internal redirect target moved.
    const redirectUrl = `/g/${token ?? ""}`;

    if (!token) {
      return new Response(
        renderPage({ title: "Barter", description: "A hyperlocal item-exchange app.", redirectUrl: "/" }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const SUPABASE_URL = Netlify.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await supabase.rpc("get_group_invite_preview", { p_token: token });

    if (error) {
      console.error("group-invite-preview: RPC call failed", { token, error });
    }

    if (error || !data || data.valid !== true) {
      return new Response(
        renderPage({
          title: "Invite link no longer available",
          description: "This invite link may have expired, been revoked, or reached its use limit.",
          redirectUrl,
        }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const description = data.groupDescription && String(data.groupDescription).trim().length > 0
      ? String(data.groupDescription)
      : `Join "${data.groupName}" on Barter.`;

    return new Response(
      renderPage({ title: `Join "${data.groupName}" on Barter`, description, redirectUrl }),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    console.error("group-invite-preview: unexpected error", err);
    return new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};

export const config = { path: "/join/:token" };
