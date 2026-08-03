// Public, unauthenticated metadata endpoint for shared listing links (PRD §3/§9).
// Messaging apps (WhatsApp/Telegram/iMessage/etc.) fetch a shared URL server-side
// to build a link preview -- since Barter is a client-rendered SPA, the raw
// index.html has no per-item Open Graph tags for a crawler to read. This function
// renders real OG tags for the requested item, then redirects an actual browser
// into the app itself, where the existing ProtectedRoute already requires login
// (PRD §3: "no public browsing page" -- this is intentionally the only
// unauthenticated surface in the app).
//
// Exposes only: photo, title, category, condition -- no owner, location, value,
// or description, matching PRD §9's "no more than what any logged-in user
// already sees... and no user-identifying data."
//
// Requires this secret to be set on the project (never in this file):
//   FRONTEND_URL - the deployed app's origin, e.g. https://barter.example.com
//                  (no trailing slash). Falls back to a relative redirect if unset,
//                  which only works if this function is ever served from the same
//                  origin as the app -- it isn't today, so this must be set for the
//                  redirect-into-the-app half of this to work.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every Edge Function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FRONTEND_URL = (Deno.env.get("FRONTEND_URL") ?? "").replace(/\/$/, "");

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

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    // Path shape: /functions/v1/item-preview/<itemId>
    const segments = url.pathname.split("/").filter(Boolean);
    const itemId = segments[segments.length - 1];

    const fallbackRedirect = FRONTEND_URL || "/";

    if (!itemId || !UUID_PATTERN.test(itemId)) {
      return new Response(
        renderPage({
          title: "Barter",
          description: "A hyperlocal item-exchange app.",
          imageUrl: null,
          redirectUrl: fallbackRedirect,
        }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const redirectUrl = FRONTEND_URL ? `${FRONTEND_URL}/item/${itemId}` : fallbackRedirect;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: item, error } = await supabase
      .from("items")
      .select("title, category, condition, image_urls")
      .eq("id", itemId)
      .maybeSingle();

    if (error || !item) {
      return new Response(
        renderPage({
          title: "Listing no longer available",
          description: "This item may have been removed.",
          imageUrl: null,
          redirectUrl,
        }),
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const imageUrl = item.image_urls && item.image_urls.length > 0 ? item.image_urls[0] : null;

    return new Response(
      renderPage({
        title: item.title,
        description: `${item.category} · ${item.condition}`,
        imageUrl,
        redirectUrl,
      }),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    console.error("item-preview: unexpected error", err);
    return new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
});
