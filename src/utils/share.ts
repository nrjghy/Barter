import { toast } from "react-hot-toast";

/**
 * Share a link to an item listing (PRD §3/§13). Uses the native Web Share
 * API where available, falling back to copying the link to the
 * clipboard. The link itself requires login to view (no public browsing
 * page per PRD §3) -- a rich preview card when shared elsewhere needs a
 * separate unauthenticated metadata endpoint that doesn't exist yet;
 * that's out of scope here, this just makes the share action itself
 * real rather than a stub.
 */
export async function shareItem(item: { id: string; title: string }): Promise<void> {
  const url = `${window.location.origin}/item/${item.id}`;

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
