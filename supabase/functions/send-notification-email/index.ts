// Triggered on INSERT to public.notifications, via the pg_net trigger in
// 20260827100328_notification_email_trigger.sql (Database Webhooks is
// unusable on Barter2, supabase_functions schema missing). Looks up the
// recipient's email via auth.users and sends it through Resend, using the
// notification's own title/content as the subject/body. Every
// notification-creation path in this app already writes meaningful,
// human-readable title/content, so no per-type template is needed here
// (PRD §7: no per-type granularity for v1, everything gets delivered).
//
// Requires these secrets to be set on the project (never in this file):
//   RESEND_API_KEY    - Resend API key
//   RESEND_FROM_EMAIL  - a verified sender address on a domain confirmed with Resend
//   FRONTEND_URL       - the deployed app's origin, e.g. https://barter.example.com
//                        (no trailing slash). Same convention as item-preview.
//                        Falls back to a relative path if unset.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every Edge Function, no need to set them.
//
// notification.content is interpolated into raw HTML below. It's HTML-escaped
// here because some notification-creation paths build content by concatenating
// user-entered text (e.g. notify_connections_item_unavailable includes listing
// titles verbatim) -- unescaped, a listing titled with an <img onerror=...> or
// a phishing <a href> would render as live HTML in the recipient's email
// client. notification.title is escaped too, since it renders inside the
// HTML body itself, not just the Resend subject field which doesn't
// interpret HTML.
//
// notification.data.actionPath / actionLabel are optional and generic --
// any notification type can set them to render a CTA link in the email
// (first use: listing_expiry_reminder's "still available?" confirmation
// link, PRD §2). actionPath is relative (e.g. "/item/<uuid>"); this
// function prefixes it with FRONTEND_URL to build the full link.
//
// August 27, sixth revision: rebuilt from a boxed-card/branded-header/
// button-CTA design to a plain, near-text layout, after confirming live
// that the boxed version landed in Gmail's Promotions tab even for a
// fresh recipient with zero prior history with this sender -- ruling out
// "just this test account's history" and pointing at the template itself.
// Per documented Gmail classifier behavior, branded header banners,
// button-styled CTAs, and boxed/shadowed containers are strong Promotions
// signals; plain, text-dominant HTML is the documented way to avoid them.
// This trades away the more polished look approved earlier for better
// inbox placement -- a deliberate choice, not an oversight. The CTA is
// now an inline text link, not a button; there's no logo header; no card
// container; and the two footer links (invite, manage preferences) are
// combined onto one line with a single "Barter" signoff instead of two
// separate mentions of the name.
//
// August 27, seventh revision: adds a List-Unsubscribe header (RFC 8058,
// one-click) whenever the trigger passes a non-null category, i.e. only
// for the five toggleable categories -- never for always-on transactional
// types, since an automated one-click request silently disabling e.g.
// trade-completed notifications would be a real harm. The link is signed
// with an HMAC over "user_id:category" keyed by SERVICE_ROLE_KEY
// (verified by the separate unsubscribe function, no new secret needed).
// Gmail/Yahoo require this header, RFC-8058-compliant, for bulk senders;
// it's also a documented Promotions-tab signal independent of that
// requirement. Live-verified end to end: a real signed link correctly
// updates only the targeted category, a tampered signature is rejected,
// POST returns a blank 200 (RFC 8058), GET returns a plain-text
// confirmation.
//
// September 3, eighth revision: notification.content used to render as a
// single <p> unconditionally, fine for every existing type since they're
// all one short sentence, but too limiting for send_product_announcement's
// longer, structured broadcast copy. renderContentHtml() below splits
// content on blank lines into paragraphs, and renders a block as a <ul>
// only when every one of its lines starts with "* "/"- " AND it has more
// than one line -- that second condition matters, it's what stops a
// single line that happens to start with "-" (e.g. from a concatenated
// listing title) from silently turning into a one-item bullet list.
// Deliberately still no button-styled CTA and no branded structure here,
// that's the exact thing the sixth revision removed for Promotions-tab
// placement; only the paragraph/list handling changed. Every pre-existing
// notification type is a single line with no blank lines, so it takes the
// plain-paragraph branch and renders byte-for-byte the same as before --
// verified by comparing output for representative existing content.
//
// September 3, ninth revision: notification.content is also what
// NotificationCenter.tsx renders in-app, raw, with no truncation or
// line-clamp -- found live when the Groups launch broadcast's full
// multi-paragraph email copy was about to go into that same field, which
// would have made every user's in-app notification the entire email.
// send_product_announcement now accepts an optional p_email_body, stored
// as notification.data.emailBody, so a broadcast can have a short
// notifications.content (what the in-app panel shows) and a separate,
// longer data.emailBody (what this function renders). Below, the email
// body prefers data.emailBody and falls back to content when it's absent
// -- every pre-existing notification type has no emailBody, so this is a
// no-op for them, byte-for-byte the same output as before.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL")!;
const FRONTEND_URL = (Deno.env.get("FRONTEND_URL") ?? "").replace(/\/$/, "");

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
  data: { actionPath?: string; actionLabel?: string; emailBody?: string } | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: NotificationRow;
  old_record: NotificationRow | null;
  category: string | null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderContentHtml(content: string): string {
  const blocks = content.split(/\n\s*\n/);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      if (lines.length === 0) {
        return "";
      }

      const isBulletBlock = lines.length > 1 && lines.every((line) => line.startsWith("* ") || line.startsWith("- "));

      if (isBulletBlock) {
        const items = lines
          .map((line) => `<li style="margin: 0 0 8px 0;">${escapeHtml(line.replace(/^[*-]\s+/, ""))}</li>`)
          .join("");
        return `<ul style="margin: 0 0 16px 0; padding-left: 20px; font-size: 15px; line-height: 1.6;">${items}</ul>`;
      }

      const escaped = escapeHtml(block.trim()).replace(/\n/g, "<br>");
      return `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">${escaped}</p>`;
    })
    .join("");
}

async function sign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    if (payload.type !== "INSERT" || payload.table !== "notifications") {
      return new Response(JSON.stringify({ skipped: "not a notification insert" }), { status: 200 });
    }

    const notification = payload.record;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(notification.user_id);

    if (userError || !userData?.user?.email) {
      console.error("send-notification-email: could not resolve recipient email", {
        notificationId: notification.id,
        userId: notification.user_id,
        userError,
      });
      return new Response(JSON.stringify({ skipped: "no recipient email" }), { status: 200 });
    }

    const actionPath = notification.data?.actionPath;
    const actionLabel = notification.data?.actionLabel ?? "Open in Barter";
    const actionUrl = actionPath ? (FRONTEND_URL ? `${FRONTEND_URL}${actionPath}` : actionPath) : null;

    const actionLinkHtml = actionUrl
      ? `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;"><a href="${escapeHtml(actionUrl)}" style="color:#1D5B2B;">${escapeHtml(actionLabel)}</a></p>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(notification.title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#1a1a1a;">
  <div style="max-width: 480px; margin: 0 auto; padding: 24px 20px;">
    <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 700; line-height: 1.5;">${escapeHtml(notification.title)}</p>
    ${renderContentHtml(notification.data?.emailBody ?? notification.content)}
    ${actionLinkHtml}
    <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color:#6b7280;">&mdash; Barter</p>
    <p style="margin: 12px 0 0 0; font-size: 12px; line-height: 1.6; color:#9ca3af;">
      <a href="https://letsbarter.app/invite.html" style="color:#9ca3af;">Invite a friend</a> &middot; <a href="https://letsbarter.app/notification-settings" style="color:#9ca3af;">Manage email preferences</a>
    </p>
  </div>
</body>
</html>`;

    let resendHeaders: Record<string, string> | undefined;
    if (payload.category) {
      const sig = await sign(SERVICE_ROLE_KEY, `${notification.user_id}:${payload.category}`);
      const unsubscribeUrl = `${SUPABASE_URL}/functions/v1/unsubscribe?u=${notification.user_id}&c=${payload.category}&sig=${sig}`;
      resendHeaders = {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: userData.user.email,
        subject: notification.title,
        html,
        ...(resendHeaders ? { headers: resendHeaders } : {}),
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      console.error("send-notification-email: Resend API error", {
        notificationId: notification.id,
        status: resendResponse.status,
        errorBody,
      });
      return new Response(JSON.stringify({ error: "resend_failed" }), { status: 502 });
    }

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (error) {
    console.error("send-notification-email: unexpected error", error);
    return new Response(JSON.stringify({ error: "unexpected_error" }), { status: 500 });
  }
});
