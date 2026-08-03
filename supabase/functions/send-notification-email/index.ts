// Triggered by a Supabase Database Webhook on INSERT to public.notifications.
// Looks up the recipient's email via auth.users and sends it through Resend,
// using the notification's own title/content as the subject/body. Every
// notification-creation path in this app already writes meaningful,
// human-readable title/content, so no per-type template is needed here
// (PRD §7: no per-type granularity for v1, everything gets delivered).
//
// Requires these secrets to be set on the project (never in this file):
//   RESEND_API_KEY    - Resend API key
//   RESEND_FROM_EMAIL  - a verified sender address on a domain confirmed with Resend
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically to
// every Edge Function, no need to set them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL")!;

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: NotificationRow;
  old_record: NotificationRow | null;
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
        html: `<div style="font-family: sans-serif; font-size: 15px; color: #1a1a1a; line-height: 1.5;">
          <p>${notification.content}</p>
          <p style="margin-top: 24px; font-size: 13px; color: #767676;">— Barter</p>
        </div>`,
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
