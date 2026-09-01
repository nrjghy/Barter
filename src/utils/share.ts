import { toast } from "react-hot-toast";
import { trackEvent } from "../lib/analytics";

// Canonical app URL. Deliberately hardcoded rather than derived from
// window.location.origin -- Netlify resolves both www.letsbarter.app and
// letsbarter.app to the same site, but WhatsApp's crawler doesn't reliably
// follow the www -> apex redirect, so a share generated on the www host
// previously produced a link with a broken preview. Always share the apex
// domain.
const APP_URL = "https://letsbarter.app";

/**
 * Copies text to the clipboard, tried against navigator.clipboard first.
 * That API is gated behind a secure context, which in practice means not
 * just https:// or localhost -- a plain http:// LAN address (e.g. testing
 * on a phone against a dev server by IP) is insecure too, and
 * clipboard.writeText silently rejects there. Falls back to the older
 * document.execCommand('copy') technique (hidden textarea, select,
 * execCommand, remove), which isn't gated the same way.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const succeeded = document.execCommand("copy");
    document.body.removeChild(textarea);
    return succeeded;
  } catch {
    return false;
  }
}

/**
 * Share a link to an item listing (PRD §3/§13). Uses the native Web Share
 * API where available, falling back to copying the link to the clipboard.
 *
 * The shared link points at the item-preview Edge Function, not the app's
 * own /item/:id route directly -- Barter is a client-rendered SPA, so a
 * messaging app unfurling a raw /item/:id link would see the static
 * index.html with no per-item Open Graph tags. item-preview renders real
 * tags server-side for the crawler, then redirects an actual person into
 * the app itself, where the existing ProtectedRoute already requires login
 * (PRD §3: no public browsing page -- this is the only unauthenticated
 * surface in the app).
 */
export async function shareItem(item: { id: string; title: string }): Promise<void> {
  const url = `${APP_URL}/listing/${item.id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: item.title, url });
      trackEvent("item_shared");
    } catch (error) {
      // AbortError means the user cancelled the share sheet -- not a failure.
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Couldn't open the share sheet.");
      }
    }
    return;
  }

  if (await copyToClipboard(url)) {
    toast.success("Link copied to clipboard");
    trackEvent("item_shared");
  } else {
    toast.error("Couldn't copy the link.");
  }
}

/**
 * Share the app itself, for inviting people who aren't yet on Barter
 * (Profile > Invite friends). Unlike shareItem, this carries an
 * accompanying text blurb, since a bare link reads as a drop, a line of
 * text reads as a personal invite.
 */
export async function shareApp(): Promise<void> {
  const text = "Been decluttering with Barter lately, trading instead of tossing things out. Worth a look:";

  if (navigator.share) {
    try {
      await navigator.share({ title: "Barter", text, url: APP_URL });
      trackEvent("app_shared");
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Couldn't open the share sheet.");
      }
    }
    return;
  }

  if (await copyToClipboard(`${text}\n${APP_URL}`)) {
    toast.success("Link copied to clipboard");
    trackEvent("app_shared");
  } else {
    toast.error("Couldn't copy the link.");
  }
}

/**
 * Share a group invite link (Groups > invite via link). Same
 * share-then-fallback-to-copy pattern as shareItem/shareApp.
 */
export async function shareGroupInvite(groupName: string, token: string): Promise<void> {
  const url = `${APP_URL}/join/${token}`;
  const text = `You're invited to join "${groupName}" on Barter:`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Barter group invite", text, url });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Couldn't open the share sheet.");
      }
    }
    return;
  }

  if (await copyToClipboard(`${text}\n${url}`)) {
    toast.success("Link copied to clipboard");
  } else {
    toast.error("Couldn't copy the link.");
  }
}
