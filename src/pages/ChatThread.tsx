import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, MapPin, Send } from "lucide-react";
import { useConnection, useConnections } from "../hooks/useConnections";
import { useMessages } from "../hooks/useMessages";
import { useAuth } from "../hooks/useAuth";
import { storageService } from "../services/storageService";
import { toast } from "react-hot-toast";
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
    const url = (message.data as { url?: string })?.url;
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[76%] p-1.5 ${radiusClass} ${
            isMine ? "bg-barter-600" : "bg-[oklch(99%_0.006_95)] border border-[oklch(88%_0.015_90)]"
          }`}
        >
          {url ? (
            <img src={url} alt="Shared photo" className="w-40 h-[118px] object-cover rounded-lg" />
          ) : (
            <div className="w-40 h-[118px] rounded-lg bg-[oklch(90%_0.02_90)] flex items-center justify-center">
              <Camera className="w-6 h-6 text-[oklch(60%_0.02_90)]" />
            </div>
          )}
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
    const hasCoords = lat != null && lng != null;

    const inner = (
      <>
        <div className="w-[200px] h-[100px] bg-[oklch(92%_0.015_90)] flex items-center justify-center">
          <MapPin className="w-7 h-7 text-[oklch(50%_0.15_30)]" />
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <MapPin className="w-4 h-4 flex-shrink-0 text-[oklch(50%_0.15_30)]" />
          <div className="min-w-0">
            <div className={`text-xs font-bold ${isMine ? "text-white" : "text-[oklch(22%_0.02_100)]"}`}>
              Location shared
            </div>
            {hasCoords && (
              <div className={`text-[11px] truncate ${isMine ? "text-[oklch(90%_0.02_145)]" : "text-[oklch(45%_0.02_95)]"}`}>
                {lat!.toFixed(4)}, {lng!.toFixed(4)} · Tap to open in Maps
              </div>
            )}
          </div>
        </div>
      </>
    );
    const bubbleClass = `block max-w-[76%] overflow-hidden ${radiusClass} ${
      isMine ? "bg-barter-600" : "bg-[oklch(99%_0.006_95)] border border-[oklch(88%_0.015_90)]"
    }`;

    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
        {hasCoords ? (
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className={bubbleClass}
          >
            {inner}
          </a>
        ) : (
          <div className={bubbleClass}>{inner}</div>
        )}
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file || !connectionId || !user) return;

    setPhotoUploading(true);
    try {
      const url = await storageService.uploadMessageImage(file, user.id, connectionId);
      sendMessage({ messageData: { connectionId, content: "", messageType: "photo", data: { url } } });
    } catch {
      // storageService already surfaces a toast on failure; nothing further to do here.
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleShareLocation = () => {
    if (!connectionId) return;

    if (!("geolocation" in navigator)) {
      toast.error("Location sharing isn't supported on this device.");
      return;
    }

    setLocationSharing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationSharing(false);
        sendMessage({
          messageData: {
            connectionId,
            content: "",
            messageType: "location",
            data: { lat: position.coords.latitude, lng: position.coords.longitude },
          },
        });
      },
      (error) => {
        setLocationSharing(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error("Location permission denied. Enable it in your browser settings to share your location.");
        } else {
          toast.error("Couldn't get your location. Please try again.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
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
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
          onChange={handlePhotoSelected}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={photoUploading}
          title="Share a photo"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[oklch(45%_0.02_95)] hover:bg-[oklch(94%_0.012_90)] disabled:opacity-40 flex-shrink-0"
        >
          {photoUploading ? (
            <div className="w-4 h-4 border-2 border-[oklch(88%_0.015_90)] border-t-barter-600 rounded-full animate-spin" />
          ) : (
            <Camera className="w-[18px] h-[18px]" />
          )}
        </button>
        <button
          onClick={handleShareLocation}
          disabled={locationSharing}
          title="Share your location"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[oklch(45%_0.02_95)] hover:bg-[oklch(94%_0.012_90)] disabled:opacity-40 flex-shrink-0"
        >
          {locationSharing ? (
            <div className="w-4 h-4 border-2 border-[oklch(88%_0.015_90)] border-t-barter-600 rounded-full animate-spin" />
          ) : (
            <MapPin className="w-[18px] h-[18px]" />
          )}
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
