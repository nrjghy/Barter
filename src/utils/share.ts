import { toast } from "react-hot-toast";

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
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/item-preview/${item.id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: item.title, url });
    } catch (error) {
      // AbortError means the user cancelled the share sheet -- not a failure.
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Couldn't open the share sheet.");
      }
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  } catch {
    toast.error("Couldn't copy the link.");
  }
}
