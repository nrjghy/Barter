import type { NotificationWithDetails } from "../services/notificationService";

export const CONNECTION_NOTIFICATION_TYPES = new Set([
  "match", "trade_completed", "item_unavailable", "pending_approval", "trade_dispute",
  "offer_received", "offer_agreed", "offer_countered", "offer_withdrawn",
  "offer_expiring_soon", "offer_auto_completing_soon", "offer_expired",
]);

export const GROUP_NOTIFICATION_TYPES = new Set([
  "group_invite", "group_invite_accepted", "group_invite_declined", "group_ownership_transferred",
]);

export function getNotificationRoute(notification: NotificationWithDetails): string | null {
  if (notification.type === "group_invite") {
    // Not yet a member -- RLS blocks /groups/:id until the invite is
    // accepted, so route to the hub where the pending-invite card lives.
    return "/groups";
  }
  if (GROUP_NOTIFICATION_TYPES.has(notification.type)) {
    const groupId = (notification.data as { groupId?: string } | undefined)?.groupId;
    return groupId ? `/groups/${groupId}` : null;
  }
  if (notification.type === "review_reminder") {
    const tradeCompletionId = (notification.data as { trade_completion_id?: string } | undefined)?.trade_completion_id;
    return tradeCompletionId ? `/trade-completion/${tradeCompletionId}/review` : null;
  }
  if (notification.type === "like") {
    const likerUserId = (notification.data as { likerUserId?: string } | undefined)?.likerUserId;
    return likerUserId ? `/user/${likerUserId}` : null;
  }
  if (notification.type === "admin_item_edit") {
    const itemId = (notification.data as { itemId?: string } | undefined)?.itemId;
    return itemId ? `/item/${itemId}` : null;
  }
  if (CONNECTION_NOTIFICATION_TYPES.has(notification.type)) {
    const connectionId = (notification.data as { connectionId?: string } | undefined)?.connectionId;
    return connectionId ? `/chat/${connectionId}` : null;
  }
  return null;
}
