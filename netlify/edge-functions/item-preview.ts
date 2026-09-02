// Public, unauthenticated metadata endpoint for shared listing links
// (PRD §3/§9). Migrated from a Supabase Edge Function (same name) to a
// Netlify Edge Function on August 27, after discovering that Supabase
// Edge Functions rewrite text/html GET responses to text/plain
// (documented platform limitation, confirmed live) -- the redirect this
// function depends on, a <meta refresh> and an inline <script>, never
// actually executed in a real browser, it just displayed raw HTML
// source. Netlify has no such restriction, and since this now runs on
// the app's own domain, the redirect target is a plain relative path
// instead of needing a separate FRONTEND_URL secret to point across
// domains the way the Supabase version did.
//
// Messaging apps (WhatsApp/Telegram/iMessage/etc.) fetch a shared URL
// server-side to build a link preview -- since Barter is a
// client-rendered SPA, the raw index.html has no per-item Open Graph
// tags for a crawler to read. This renders real OG tags for the
// requested item, then redirects an actual browser into the app itself,
// where the existing ProtectedRoute already requires login (PRD §3: "no
// public browsing page" -- this is intentionally one of only two
// unauthenticated surfaces in the app, alongside /invite.html).
//
// Exposes only: photo, title, category, condition -- no owner, location,
// value, or description, matching PRD §9's "no more than what any
// logged-in user already sees... and no user-identifying data."
//
// Requires these in Netlify's own environment variables (Site
// configuration > Environment variables, scoped to Edge Functions --
// netlify.toml env vars are NOT visible to edge functions, and this is a
// separate secrets store from Supabase's Edge Function secrets):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// 2026-09-02: two fixes made after a live incident where every shared
// listing link, regardless of item, showed "Listing no longer
// available." Root cause was never confirmed from inside this function,
// because a Supabase query error was silently folded into the same
// generic "not found" response with no logging -- see the console.error
// added below. If this happens again, check the Netlify function logs
// first; if they're empty, the query is failing before it ever runs.
// Separately: this previously returned a cancelled/traded/expired item's
// real title and photo, since it never checked status. That's now
// filtered explicitly rather than relying on the query to fail for a
// non-active item, which it never did.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderPage(opts: { title: string; description: string; imageUrl: string | null; redirectUrl: string }): string {
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
${opts.imageUrl ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}">` : ""}
<meta property="og:type" content="website">
<meta name="twitter:card" content="${opts.imageUrl ? "summary_large_image" : "summary"}">
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
    const itemId = segments[segments.length - 1];

    if (!itemId || !UUID_PATTERN.test(itemId)) {
      return new Response(
        renderPage({ title: "Barter", description: "A hyperlocal item-exchange app.", imageUrl: null, redirectUrl: "/" }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const redirectUrl = `/item/${itemId}`;

    const SUPABASE_URL = Netlify.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: item, error } = await supabase
      .from("items")
      .select("title, category, condition, image_urls, status")
      .eq("id", itemId)
      .maybeSingle();

    if (error) {
      // This used to be silently swallowed into the generic "not found"
      // response below, which is exactly why a systemic failure (bad
      // SUPABASE_URL/SERVICE_ROLE_KEY, project unreachable, etc.) looked
      // identical to a single missing item and left no trace in the logs.
      console.error("item-preview: Supabase query failed", { itemId, error });
    }

    if (error || !item || item.status !== "active") {
      return new Response(
        renderPage({ title: "Listing no longer available", description: "This item may have been removed.", imageUrl: null, redirectUrl }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const imageUrl = item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return new Response(
      renderPage({ title: item.title, description: `${item.category} · ${item.condition}`, imageUrl, redirectUrl }),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    console.error("item-preview: unexpected error", err);
    return new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};

export const config = { path: "/listing/:id" };
