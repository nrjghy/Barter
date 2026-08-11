import React from "react";
import { useNavigate } from "react-router-dom";
import { Package, MessageCircleHeart } from "lucide-react";
import { useConnections } from "../hooks/useConnections";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { formatRelativeTime } from "../utils/time";
import { pickAvatarPalette } from "../utils/avatar";
import type { ConnectionItemInterestPair, ConnectionLastMessage, ConnectionSummary } from "../services/connectionService";

function buildItemLabel(itemInterests: ConnectionItemInterestPair[]): string {
  const seen = new Set<string>();
  const titles: string[] = [];
  const addItem = (item: { id: string; title: string; listingType?: "trade" | "giveaway" } | null) => {
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      titles.push(item.listingType === "giveaway" ? `${item.title} (Giveaway)` : item.title);
    }
  };
  itemInterests.forEach((interest) => addItem(interest.myItem));
  itemInterests.forEach((interest) => addItem(interest.theirItem));
  return titles.join(" · ");
}

function buildPreview(lastMessage: ConnectionLastMessage | null): { text: string; italic: boolean } {
  if (!lastMessage) return { text: "Say hello!", italic: true };
  if (lastMessage.messageType === "photo") return { text: "📷 Photo", italic: false };
  if (lastMessage.messageType === "location") return { text: "📍 Location shared", italic: false };
  return { text: lastMessage.content, italic: false };
}

const ConnectionRow: React.FC<{ connection: ConnectionSummary; onOpen: (id: string) => void }> = ({
  connection,
  onOpen,
}) => {
  const palette = pickAvatarPalette(connection.otherUser.id);
  const initial = connection.otherUser.username.charAt(0).toUpperCase();
  const itemLabel = buildItemLabel(connection.itemInterests);
  const preview = buildPreview(connection.lastMessage);
  const timestamp = connection.lastMessage?.createdAt ?? connection.updatedAt;

  return (
    <div
      onClick={() => onOpen(connection.id)}
      className="flex items-center gap-3 py-3 border-b border-[oklch(88%_0.015_90)] cursor-pointer"
    >
      <div
        className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
        style={{ background: palette.bg, color: palette.color }}
      >
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[oklch(22%_0.02_100)]">{connection.otherUser.username}</div>
        {itemLabel && (
          <div className="flex items-center gap-1.5 my-0.5">
            <Package className="w-3.5 h-3.5 text-[oklch(50%_0.02_90)] flex-shrink-0" />
            <div className="text-xs font-semibold text-[oklch(50%_0.02_90)] truncate">{itemLabel}</div>
          </div>
        )}
        <div className={`text-xs text-[oklch(45%_0.02_95)] truncate ${preview.italic ? "italic" : ""}`}>
          {preview.text}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <div className="text-[11px] text-[oklch(50%_0.02_90)]">{formatRelativeTime(timestamp)}</div>
        {connection.isNew && (
          <div className="px-[7px] py-[2px] rounded-full bg-[oklch(60%_0.1_55)] text-white text-[10px] font-bold">
            New
          </div>
        )}
      </div>
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-5 py-16">
    <div className="w-16 h-16 rounded-full bg-barter-100 flex items-center justify-center text-barter-700">
      <MessageCircleHeart className="w-8 h-8" />
    </div>
    <div className="text-lg font-bold text-[oklch(22%_0.02_100)]">No connections yet</div>
    <div className="text-sm text-[oklch(45%_0.02_95)] leading-relaxed max-w-[240px]">
      When you and someone else both like the same item, you'll match here and can start chatting.
    </div>
  </div>
);

export const Chat: React.FC = () => {
  const navigate = useNavigate();
  const { connections, loading, error } = useConnections();

  const handleOpen = (connectionId: string) => {
    navigate(`/chat/${connectionId}`);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      {loading && (
        <div className="py-16">
          <LoadingSpinner />
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16 text-sm text-[oklch(50%_0.15_30)]">
          Couldn't load your connections. Please try again.
        </div>
      )}

      {!loading && !error && connections.length === 0 && <EmptyState />}

      {!loading && !error && connections.length > 0 && (
        <div>
          {connections.map((connection) => (
            <ConnectionRow key={connection.id} connection={connection} onOpen={handleOpen} />
          ))}
        </div>
      )}
    </div>
  );
};
