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
// any notification type can set them to render a CTA button in the email
// (first use: listing_expiry_reminder's "still available?" confirmation
// link, PRD §2; match/giveaway notifications added August 27, linking to
// the chat thread). actionPath is relative (e.g. "/item/<uuid>"); this
// function prefixes it with FRONTEND_URL to build the full link, same
// pattern as item-preview's own redirect construction.
//
// August 27, second revision: switched from a dark theme to the current
// light design (#FDFCF7/white card/#1D5B2B) after live-testing found the
// dark version broken specifically in the native Gmail iOS app -- see
// prior revision history in git for the full investigation.
//
// August 27, third revision: added a standing "invite a friend" line to
// the footer of every notification email (not the two Supabase Auth
// templates, which are a separate Dashboard-managed system), reusing the
// same https://letsbarter.app link the in-app Profile > Invite friends
// share button already uses -- no referral/attribution tracking exists in
// the app, so this doesn't invent one. Kept deliberately small and low in
// the footer, below the CTA button, so it reads as a quiet utility line
// (like the "Barter" signature itself) rather than a second call to
// action competing with the email's actual content. Also dropped
// "Warsaw, Poland" from the footer signature, in anticipation of
// additional pilot cities.

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
      // Return 200 so Supabase doesn't retry indefinitely on a permanent
      // lookup failure (e.g. the user was deleted between the notification
      // being inserted and this webhook firing).
      return new Response(JSON.stringify({ skipped: "no recipient email" }), { status: 200 });
    }

    const actionPath = notification.data?.actionPath;
    const actionLabel = notification.data?.actionLabel ?? "Open in Barter";
    const actionUrl = actionPath ? (FRONTEND_URL ? `${FRONTEND_URL}${actionPath}` : actionPath) : null;

    const actionButtonHtml = actionUrl
      ? `<tr>
          <td align="center" style="padding: 0 32px 24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="border-radius: 12px; background-color:#1D5B2B;">
                  <a href="${escapeHtml(actionUrl)}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 700; color:#ffffff; text-decoration: none; border-radius: 12px;">${escapeHtml(actionLabel)}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(notification.title)}</title>
</head>
<body style="margin:0; padding:0; background-color:#FDFCF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FDFCF7; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color:#ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
          <tr>
            <td align="center" style="padding: 32px 32px 0 32px;">
              <span style="font-size: 22px; font-weight: 800; color:#1D5B2B; letter-spacing: -0.02em;">Barter</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px 24px 32px;">
              <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 800; color:#1a1a1a;">${escapeHtml(notification.title)}</h1>
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color:#4b5563;">${escapeHtml(notification.content)}</p>
            </td>
          </tr>
          ${actionButtonHtml}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px;">
          <tr>
            <td align="center" style="padding: 20px 32px 4px 32px;">
              <p style="margin: 0; font-size: 11px; line-height: 1.6; color:#9ca3af;">Barter works best with more people trading nearby. <a href="https://letsbarter.app" style="color:#1D5B2B; text-decoration: underline;">Invite a friend</a></p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 4px 32px 20px 32px;">
              <p style="margin: 0; font-size: 11px; color:#c1c9c1;">Barter</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
