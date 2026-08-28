// Public, unauthenticated RFC 8058 one-click unsubscribe endpoint for the
// List-Unsubscribe email header. Only ever linked from the five
// toggleable notification categories (see trigger_send_notification_email's
// category mapping) -- always-on transactional types never get this
// header at all, since silently disabling e.g. trade-completed
// notifications via an automated one-click request would be a real harm,
// not a convenience.
//
// The link is signed with an HMAC over "user_id:category", keyed by
// SUPABASE_SERVICE_ROLE_KEY (already available to every Edge Function, no
// new secret needed). This endpoint has to work with zero authentication
// -- email clients submit the POST automatically, often without the
// person ever opening the email -- so the signature is what stops a
// stranger from unsubscribing an arbitrary user from an arbitrary
// category just by guessing a UUID.
//
// Per Resend's documented requirement: a POST (the automated one-click
// case) returns a blank 200 immediately, no page, that's what "one-click"
// means. A GET (a person actually clicking a visible link somewhere)
// returns a short human-readable confirmation instead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_CATEGORIES = ["match", "message", "product_update", "review_reminder", "onboarding"];

async function sign(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SERVICE_ROLE_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("u");
    const category = url.searchParams.get("c");
    const sig = url.searchParams.get("sig");

    if (!userId || !category || !sig || !VALID_CATEGORIES.includes(category)) {
      return new Response("Invalid or expired unsubscribe link.", { status: 400, headers: { "Content-Type": "text/plain" } });
    }

    const expectedSig = await sign(`${userId}:${category}`);
    if (expectedSig !== sig) {
      return new Response("Invalid or expired unsubscribe link.", { status: 400, headers: { "Content-Type": "text/plain" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: userRow, error: fetchError } = await supabase
      .from("users")
      .select("notification_preferences")
      .eq("id", userId)
      .maybeSingle();

    if (fetchError || !userRow) {
      return new Response("Invalid or expired unsubscribe link.", { status: 400, headers: { "Content-Type": "text/plain" } });
    }

    const currentPrefs = userRow.notification_preferences ?? {};
    const updatedPrefs = {
      ...currentPrefs,
      [category]: { ...(currentPrefs[category] ?? {}), email: false },
    };

    const { error: updateError } = await supabase
      .from("users")
      .update({ notification_preferences: updatedPrefs })
      .eq("id", userId);

    if (updateError) {
      console.error("unsubscribe: failed to update preferences", { userId, category, updateError });
      return new Response("Something went wrong. Please try again.", { status: 500, headers: { "Content-Type": "text/plain" } });
    }

    if (req.method === "POST") {
      return new Response(null, { status: 200 });
    }

    return new Response(
      "You've been unsubscribed from this type of email. You can manage all your email preferences at https://letsbarter.app/notification-settings",
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  } catch (error) {
    console.error("unsubscribe: unexpected error", error);
    return new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
});
