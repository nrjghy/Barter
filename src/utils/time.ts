/**
 * Short relative-time formatting, matching the style used in the approved
 * Chat mockup (e.g. "2m", "3d", "1h"). Falls back to a short date once
 * something is more than a week old.
 */
export function formatRelativeTime(isoString: string): string {
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
