import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, MapPin, Send } from "lucide-react";
import { useConnection, useConnections } from "../hooks/useConnections";
import { useMessages } from "../hooks/useMessages";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import type { MessageWithDetails } from "../services/messageService";

// Bubble styling matches the approved mockup exactly (design/Barter Nav
// Shell.dc.html): own messages right-aligned solid green, others
// left-aligned off-white with a border. Photo/location rendering is
// built now even though their composer buttons are still disabled --
// rendering is cheap and self-contained; the send-side (upload,
// geolocation) is separately scoped work.
const MessageBubble: React.FC<{ message: MessageWithDetails; isMine: boolean }> = ({ message, isMine }) => {
  if (message.messageType === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[88%] px-4 py-3 rounded-2xl bg-barter-100 text-barter-800 text-xs font-semibold text-center leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  const radiusClass = isMine ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md";

  if (message.messageType === "photo") {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[76%] p-1.5 ${radiusClass} ${
            isMine ? "bg-barter-600" : "bg-[oklch(99%_0.006_95)] border border-[oklch(88%_0.015_90)]"
          }`}
        >
          <div className="w-40 h-[118px] rounded-lg bg-[oklch(90%_0.02_90)] flex items-center justify-center">
            <Camera className="w-6 h-6 text-[oklch(60%_0.02_90)]" />
          </div>
          {message.content && (
            <div className={`text-xs px-1 pt-1.5 pb-0.5 ${isMine ? "text-white" : "text-[oklch(22%_0.02_100)]"}`}>
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (message.messageType === "location") {
    const lat = (message.data as { lat?: number })?.lat;
    const lng = (message.data as { lng?: number })?.lng;
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[76%] overflow-hidden ${radiusClass} ${
            isMine ? "bg-barter-600" : "bg-[oklch(99%_0.006_95)] border border-[oklch(88%_0.015_90)]"
          }`}
        >
          <div className="w-[200px] h-[100px] bg-[oklch(92%_0.015_90)] flex items-center justify-center">
            <MapPin className="w-7 h-7 text-[oklch(50%_0.15_30)]" />
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <MapPin className="w-4 h-4 flex-shrink-0 text-[oklch(50%_0.15_30)]" />
            <div className="min-w-0">
              <div className={`text-xs font-bold ${isMine ? "text-white" : "text-[oklch(22%_0.02_100)]"}`}>
                Location shared
              </div>
              {lat != null && lng != null && (
                <div className={`text-[11px] truncate ${isMine ? "text-[oklch(90%_0.02_145)]" : "text-[oklch(45%_0.02_95)]"}`}>
                  {lat.toFixed(4)}, {lng.toFixed(4)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // text
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[76%] px-[13px] py-2.5 text-[13.5px] leading-snug ${radiusClass} ${
          isMine
            ? "bg-barter-600 text-white"
            : "bg-[oklch(99%_0.006_95)] text-[oklch(22%_0.02_100)] border border-[oklch(88%_0.015_90)]"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
};

export const ChatThread: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const { connection, loading: connectionLoading } = useConnection(connectionId);
  const { user } = useAuth();
  const { markConnectionOpened } = useConnections();
  const { messages, messagesLoading, sendMessage, sendMessageLoading, markMessagesAsRead } = useMessages(connectionId);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasMarkedOpened = useRef(false);

  useEffect(() => {
    if (connectionId && !hasMarkedOpened.current) {
      hasMarkedOpened.current = true;
      markConnectionOpened(connectionId);
      markMessagesAsRead({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages.length]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content || !connectionId) return;
    sendMessage({ messageData: { connectionId, content, messageType: "text" } });
    setDraft("");
  };

  const itemLabel = connection
    ? Array.from(
        new Set(
          connection.itemInterests.flatMap((i) => [i.myItem?.title, i.theirItem?.title].filter(Boolean) as string[])
        )
      ).join(" · ")
    : "";

  // Messages come back newest-first from getConnectionMessages; the
  // thread reads top-to-bottom oldest-first.
  const orderedMessages = [...messages].reverse();

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-[oklch(88%_0.015_90)]">
        <button onClick={() => navigate("/chat")} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-[oklch(22%_0.02_100)]" />
        </button>
        <div className="min-w-0">
          <div className="text-base font-semibold text-[oklch(22%_0.02_100)] truncate">
            {connection?.otherUser.username ?? "Chat"}
          </div>
          {itemLabel && <div className="text-xs text-[oklch(50%_0.02_90)] truncate">{itemLabel}</div>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-[oklch(96%_0.014_92)]">
        {(connectionLoading || messagesLoading) && (
          <div className="py-10">
            <LoadingSpinner color="barter" />
          </div>
        )}
        {!messagesLoading &&
          orderedMessages.map((message) => (
            <MessageBubble key={message.id} message={message} isMine={message.senderId === user?.id} />
          ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-t border-[oklch(88%_0.015_90)] bg-[oklch(99%_0.006_95)]">
        <button
          disabled
          title="Photo sharing is coming soon"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[oklch(45%_0.02_95)] opacity-40 cursor-not-allowed flex-shrink-0"
        >
          <Camera className="w-[18px] h-[18px]" />
        </button>
        <button
          disabled
          title="Location sharing is coming soon"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[oklch(45%_0.02_95)] opacity-40 cursor-not-allowed flex-shrink-0"
        >
          <MapPin className="w-[18px] h-[18px]" />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Message…"
          className="flex-1 px-3.5 py-2.5 rounded-full bg-[oklch(94%_0.012_90)] text-[13px] text-[oklch(22%_0.02_100)] placeholder:text-[oklch(52%_0.02_90)] outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sendMessageLoading}
          className="w-8 h-8 rounded-full bg-barter-600 flex items-center justify-center text-white flex-shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
