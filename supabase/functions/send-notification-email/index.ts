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
  data: { actionPath?: string; actionLabel?: string } | null;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: NotificationRow;
  old_record: NotificationRow | null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
    <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6;">${escapeHtml(notification.content)}</p>
    ${actionLinkHtml}
    <p style="margin: 24px 0 0 0; font-size: 13px; line-height: 1.6; color:#6b7280;">&mdash; Barter</p>
    <p style="margin: 12px 0 0 0; font-size: 12px; line-height: 1.6; color:#9ca3af;">
      <a href="https://letsbarter.app/invite.html" style="color:#9ca3af;">Invite a friend</a> &middot; <a href="https://letsbarter.app/notification-settings" style="color:#9ca3af;">Manage email preferences</a>
    </p>
  </div>
</body>
</html>`;

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
