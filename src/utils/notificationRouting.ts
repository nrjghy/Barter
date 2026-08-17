import type { NotificationWithDetails } from "../services/notificationService";

export const CONNECTION_NOTIFICATION_TYPES = new Set([
  "match", "trade_completed", "item_unavailable", "pending_approval", "trade_dispute",
  "offer_received", "offer_agreed", "offer_countered", "offer_withdrawn",
  "offer_expiring_soon", "offer_auto_completing_soon", "offer_expired",
]);

export function getNotificationRoute(notification: NotificationWithDetails): string | null {
  if (notification.type === "review_reminder") {
    const tradeCompletionId = (notification.data as { trade_completion_id?: string } | undefined)?.trade_completion_id;
    return tradeCompletionId ? `/trade-completion/${tradeCompletionId}/review` : null;
  }
  if (CONNECTION_NOTIFICATION_TYPES.has(notification.type)) {
    const connectionId = (notification.data as { connectionId?: string } | undefined)?.connectionId;
    return connectionId ? `/chat/${connectionId}` : null;
  }
  return null;
}
