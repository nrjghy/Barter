import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, MapPin, Send, MoreVertical, X, AlertTriangle, ExternalLink } from "lucide-react";
import { useConnection, useConnections } from "../hooks/useConnections";
import { useMessages } from "../hooks/useMessages";
import { useAuth } from "../hooks/useAuth";
import { useUserBlocks } from "../hooks/useUserBlocks";
import { useReports } from "../hooks/useReports";
import { useTradeCompletionsByIds } from "../hooks/useTradeCompletions";
import { useOffers, useOffersByIds } from "../hooks/useOffers";
import { ConnectionService, TradeCompletionService } from "../services";
import type { TradeCompletionDisputeInfo } from "../services/tradeCompletionService";
import type { OfferSummary } from "../services/offerService";
import { storageService } from "../services/storageService";
import { toast } from "react-hot-toast";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { InfoTooltip } from "../components/InfoTooltip";
import { LocationSharePicker } from "../components/LocationSharePicker";
import { useShowError } from "../hooks/useShowError";
import { trackEvent } from "../lib/analytics";
import { REPORT_REASONS } from "../types";
import type { MessageWithDetails } from "../services/messageService";

// Bubble styling matches the approved mockup exactly (design/Barter Nav
// Shell.dc.html): own messages right-aligned solid green, others
// left-aligned off-white with a border. Photo/location rendering is
// built now even though their composer buttons are still disabled --
// rendering is cheap and self-contained; the send-side (upload,
// geolocation) is separately scoped work.
// Offer system-card, keyed off message.data.offerId -- same convention as
// the trade-completion system card below (a sub-component reading fresh
// status from a bulk-fetched-by-id map, not from the static message text,
// since e.g. accept/withdraw don't rewrite earlier messages). Renders on
// every offer-related system message (offer sent, accepted, withdrawn,
// expired -- they all share the same offerId), but Accept/Modify only
// show while that offer is still actually pending and the viewer is the
// recipient, not the proposer.
const OfferMessage: React.FC<{
  message: MessageWithDetails;
  currentUserId?: string;
  offer?: OfferSummary;
  onAccept: (offerId: string) => void;
  onModify: (offerId: string) => void;
}> = ({ message, currentUserId, offer, onAccept, onModify }) => {
  const offerId = (message.data as { offerId?: string } | undefined)?.offerId;

  if (!offerId || !offer) {
    return (
      <div className="max-w-[88%] px-4 py-3 rounded-2xl bg-barter-100 text-barter-800 text-xs font-semibold text-center leading-relaxed">
        {message.content}
      </div>
    );
  }

  const canRespond = offer.status === "pending" && !!currentUserId && offer.proposedBy !== currentUserId;
  const myItems = offer.items.filter((i) => i.offeredBy === currentUserId);
  const theirItems = offer.items.filter((i) => i.offeredBy !== currentUserId);

  return (
    <>
      <div className="max-w-[88%] px-4 py-3 rounded-2xl bg-barter-100 text-barter-800 text-xs font-semibold text-center leading-relaxed">
        {message.content}
      </div>
      <div className="max-w-[88%] w-full px-3.5 py-3 rounded-2xl border border-[oklch(88%_0.015_90)] bg-white text-[12px] text-[oklch(35%_0.02_95)]">
        <div className="flex items-start gap-2">
          <span className="font-bold text-[oklch(22%_0.02_100)] flex-shrink-0">You:</span>
          <span>{myItems.map((i) => i.title).join(", ") || "—"}</span>
        </div>
        <div className="flex items-start gap-2 mt-1">
          <span className="font-bold text-[oklch(22%_0.02_100)] flex-shrink-0">Them:</span>
          <span>{theirItems.map((i) => i.title).join(", ") || "—"}</span>
        </div>
      </div>
      {canRespond && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAccept(offerId)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-barter-600 text-white text-[11px] font-bold"
          >
            Accept
          </button>
          <button
            onClick={() => onModify(offerId)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-barter-600 text-barter-700 text-[11px] font-bold"
          >
            Modify
          </button>
        </div>
      )}
    </>
  );
};

// Curator listing system-card, keyed off message.data.sourceUrl -- same
// convention as OfferMessage above (reading fresh data off the message
// itself rather than parsing the static content string). Sent once by
// create_curator_connection when a pilot user expresses interest in a
// curator-account item; renders the external listing link as a tappable
// card since message bodies aren't linkified anywhere else in the app.
const CuratorListingMessage: React.FC<{ message: MessageWithDetails }> = ({ message }) => {
  const sourceUrl = (message.data as { sourceUrl?: string } | undefined)?.sourceUrl;

  return (
    <>
      <div className="max-w-[88%] px-4 py-3 rounded-2xl bg-barter-100 text-barter-800 text-xs font-semibold text-center leading-relaxed">
        {message.content}
      </div>
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="max-w-[88%] w-full flex items-center gap-2 px-3.5 py-3 rounded-2xl border border-[oklch(88%_0.015_90)] bg-white text-[12px] font-bold text-barter-700"
        >
          <ExternalLink className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">View original listing</span>
        </a>
      )}
    </>
  );
};

const MessageBubble: React.FC<{
  message: MessageWithDetails;
  isMine: boolean;
  currentUserId?: string;
  tradeCompletionsById: Record<string, TradeCompletionDisputeInfo>;
  onDispute: (tradeCompletionId: string) => void;
  onApprove: (tradeCompletionId: string) => void;
  offersById: Record<string, OfferSummary>;
  onAcceptOffer: (offerId: string) => void;
  onModifyOffer: (offerId: string) => void;
}> = ({
  message,
  isMine,
  currentUserId,
  tradeCompletionsById,
  onDispute,
  onApprove,
  offersById,
  onAcceptOffer,
  onModifyOffer,
}) => {
  if (message.messageType === "system") {
    const curatorSourceUrl = (message.data as { sourceUrl?: string } | undefined)?.sourceUrl;
    if (curatorSourceUrl) {
      return (
        <div className="flex flex-col items-center gap-1.5">
          <CuratorListingMessage message={message} />
        </div>
      );
    }

    const offerId = (message.data as { offerId?: string } | undefined)?.offerId;
    if (offerId) {
      return (
        <div className="flex flex-col items-center gap-1.5">
          <OfferMessage
            message={message}
            currentUserId={currentUserId}
            offer={offersById[offerId]}
            onAccept={onAcceptOffer}
            onModify={onModifyOffer}
          />
        </div>
      );
    }

    const tradeCompletionId = (message.data as { tradeCompletionId?: string } | undefined)?.tradeCompletionId;
    const tradeCompletion = tradeCompletionId ? tradeCompletionsById[tradeCompletionId] : undefined;
    const canDispute =
      !!tradeCompletion &&
      !!currentUserId &&
      tradeCompletion.completedBy !== currentUserId &&
      tradeCompletion.disputedAt === null &&
      new Date() < new Date(tradeCompletion.disputeDeadline);
    // Only the lister can approve -- completedBy on a giveaway claim is
    // whoever claimed it (the recipient), never the lister themselves.
    const canApprove =
      !!tradeCompletion &&
      !!currentUserId &&
      tradeCompletion.status === "pending_approval" &&
      tradeCompletion.completedBy !== currentUserId;

    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="max-w-[88%] px-4 py-3 rounded-2xl bg-barter-100 text-barter-800 text-xs font-semibold text-center leading-relaxed">
          {message.content}
        </div>
        {canApprove && (
          <button
            onClick={() => onApprove(tradeCompletionId!)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-barter-600 text-white text-[11px] font-bold"
          >
            Approve claim
          </button>
        )}
        {canDispute && (
          <button
            onClick={() => onDispute(tradeCompletionId!)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[oklch(50%_0.15_30_/_0.3)] text-[oklch(50%_0.15_30)] text-[11px] font-bold"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Dispute this trade
          </button>
        )}
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
    const label = (message.data as { label?: string })?.label;
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
                {label ? label : `${lat!.toFixed(4)}, ${lng!.toFixed(4)}`} · Tap to open in Maps
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

function formatCountdown(target: string): string {
  const diffMs = new Date(target).getTime() - Date.now();
  if (diffMs <= 0) return "any moment now";
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Ticks every 30s -- plenty of resolution for a countdown that spans days,
// without re-rendering the whole strip every second.
function useCountdownLabel(target: string | null | undefined): string | null {
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, [target]);
  return target ? formatCountdown(target) : null;
}

// The confirmed design: a persistent pinned strip above the composer (not
// a passive card in the scroll), shown whenever the connection has an
// `agreed` offer -- distinct from OfferMessage's per-message card, which
// only reflects a single historical event.
const AgreedOfferStrip: React.FC<{
  offer: OfferSummary;
  currentUserId?: string;
  onConfirmNow: () => void;
  onWithdraw: () => void;
}> = ({ offer, currentUserId, onConfirmNow, onWithdraw }) => {
  const countdown = useCountdownLabel(offer.autoCompleteAt);
  const myItems = offer.items.filter((i) => i.offeredBy === currentUserId);
  const theirItems = offer.items.filter((i) => i.offeredBy !== currentUserId);
  const summary = [myItems.map((i) => i.title).join(", "), theirItems.map((i) => i.title).join(", ")]
    .filter(Boolean)
    .join(" ↔ ");

  return (
    <div className="flex-shrink-0 px-3.5 py-3 border-t border-[oklch(88%_0.015_90)] bg-barter-50">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="px-2 py-0.5 rounded-full bg-barter-600 text-white text-[10px] font-extrabold tracking-wide">
          AGREED
        </span>
        {countdown && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-[oklch(45%_0.02_95)]">
            Auto-withdraws in {countdown}
            <InfoTooltip
              text="If neither of you confirms or withdraws by then, this agreement is automatically withdrawn and the items become available to others again. You can still mark the trade complete afterward if it happened."
              label="Auto-withdraw"
            />
          </span>
        )}
      </div>
      <div className="text-[12.5px] font-semibold text-[oklch(22%_0.02_100)] mb-2.5 truncate">{summary}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={onConfirmNow}
          className="flex-1 py-2.5 rounded-xl bg-barter-600 text-white text-[12.5px] font-bold"
        >
          Confirm now
        </button>
        <button
          onClick={onWithdraw}
          className="flex-1 py-2.5 rounded-xl border border-[oklch(50%_0.15_30_/_0.4)] text-[oklch(50%_0.15_30)] text-[12.5px] font-bold"
        >
          Withdraw
        </button>
      </div>
    </div>
  );
};

export const ChatThread: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { connection, loading: connectionLoading } = useConnection(connectionId);
  const { user } = useAuth();
  const showError = useShowError();
  const { markConnectionOpened } = useConnections();
  const { messages, messagesLoading, sendMessage, sendMessageLoading, markMessagesAsRead } = useMessages(connectionId);
  // Shared across all four sendMessage call sites below -- computed once
  // per render from the already-loaded thread rather than repeating the
  // check at each site. Not race-proof against two near-simultaneous first
  // sends, acceptable for an analytics-only event.
  const isFirstRealMessage = !messages.some((m) => m.messageType !== "system");
  const trackFirstMessageIfNeeded = () => {
    if (isFirstRealMessage && connectionId) {
      trackEvent("chat_first_message", { connectionId });
    }
  };
  const { blockUser } = useUserBlocks();
  const { createReport, createReportLoading } = useReports();
  const [draft, setDraft] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [locationSharing, setLocationSharing] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockSubmitting, setBlockSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [disputeTradeCompletionId, setDisputeTradeCompletionId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [approveTradeCompletionId, setApproveTradeCompletionId] = useState<string | null>(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [selectedClaimItemId, setSelectedClaimItemId] = useState<string | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasMarkedOpened = useRef(false);

  const tradeCompletionIds = Array.from(
    new Set(
      messages
        .filter((m) => m.messageType === "system")
        .map((m) => (m.data as { tradeCompletionId?: string } | undefined)?.tradeCompletionId)
        .filter((id): id is string => !!id)
    )
  );
  const { tradeCompletionsById } = useTradeCompletionsByIds(tradeCompletionIds);

  const offerIds = Array.from(
    new Set(
      messages
        .filter((m) => m.messageType === "system")
        .map((m) => (m.data as { offerId?: string } | undefined)?.offerId)
        .filter((id): id is string => !!id)
    )
  );
  const { offersById } = useOffersByIds(offerIds);
  const { currentOffer, acceptOffer, withdrawOffer } = useOffers(connectionId);

  const handleAcceptOffer = async (offerId: string) => {
    try {
      const { error } = await acceptOffer(offerId);
      if (error) {
        showError(error);
        return;
      }
      toast.success("Offer accepted!");
    } catch {
      toast.error("Couldn't accept this offer. Please try again.");
    }
  };

  const handleModifyOffer = (offerId: string) => {
    if (connectionId) navigate(`/chat/${connectionId}/offer`, { state: { counterOfferId: offerId } });
  };

  const handleOpenOfferComposer = () => {
    if (connectionId) navigate(`/chat/${connectionId}/offer`);
  };

  const handleConfirmNow = () => {
    if (!connectionId || !currentOffer) return;
    navigate(`/chat/${connectionId}/trade-complete`, {
      state: { offerItemIds: currentOffer.items.map((i) => i.id) },
    });
  };

  const handleConfirmWithdraw = async () => {
    if (!currentOffer) return;
    setWithdrawSubmitting(true);
    try {
      const { error } = await withdrawOffer(currentOffer.id);
      if (error) {
        showError(error);
        return;
      }
      toast.success("Trade withdrawn");
      setWithdrawConfirmOpen(false);
    } catch {
      toast.error("Couldn't withdraw this trade. Please try again.");
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  const handleConfirmDispute = async () => {
    if (!disputeTradeCompletionId) return;
    setDisputeSubmitting(true);
    try {
      const { error } = await TradeCompletionService.fileDispute(
        disputeTradeCompletionId,
        disputeReason.trim() || undefined
      );
      if (error) {
        showError(error);
        return;
      }
      toast.success("Dispute filed — a moderator will review it");
      setDisputeTradeCompletionId(null);
      setDisputeReason("");
      if (connectionId) queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
      queryClient.invalidateQueries({ queryKey: ["tradeCompletionsByIds"] });
    } catch {
      toast.error("Couldn't file the dispute. Please try again.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const handleConfirmApprove = async () => {
    if (!approveTradeCompletionId || !user) return;
    setApproveSubmitting(true);
    try {
      const { error } = await TradeCompletionService.approveGiveawayCompletion(user.id, approveTradeCompletionId);
      if (error) {
        showError(error);
        return;
      }
      toast.success("Claim approved!");
      setApproveTradeCompletionId(null);
      if (connectionId) queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
      queryClient.invalidateQueries({ queryKey: ["tradeCompletionsByIds"] });
    } catch {
      toast.error("Couldn't approve this claim. Please try again.");
    } finally {
      setApproveSubmitting(false);
    }
  };

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
  }, [messages.length, currentOffer?.status]);

  const handleSend = () => {
    const content = draft.trim();
    if (!content || !connectionId) return;
    sendMessage(
      { messageData: { connectionId, content, messageType: "text" } },
      { onSuccess: trackFirstMessageIfNeeded }
    );
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
      sendMessage(
        { messageData: { connectionId, content: "", messageType: "photo", data: { url } } },
        { onSuccess: trackFirstMessageIfNeeded }
      );
    } catch {
      // storageService already surfaces a toast on failure; nothing further to do here.
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleShareLocation = () => {
    if (!connectionId) return;
    setLocationPickerOpen(false);

    if (!("geolocation" in navigator)) {
      toast.error("Location sharing isn't supported on this device.");
      return;
    }

    setLocationSharing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationSharing(false);
        sendMessage(
          {
            messageData: {
              connectionId,
              content: "",
              messageType: "location",
              data: { lat: position.coords.latitude, lng: position.coords.longitude },
            },
          },
          { onSuccess: trackFirstMessageIfNeeded }
        );
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

  const handleSelectSearchedPlace = (place: { lat: number; lng: number; label: string }) => {
    if (!connectionId) return;
    setLocationPickerOpen(false);
    sendMessage(
      {
        messageData: {
          connectionId,
          content: "",
          messageType: "location",
          data: { lat: place.lat, lng: place.lng, label: place.label },
        },
      },
      { onSuccess: trackFirstMessageIfNeeded }
    );
  };

  const otherUserId = connection?.otherUser.id;
  const otherUsername = connection?.otherUser.username ?? "this user";
  // Curated external listings (the "Barter Finds" account) never go through
  // an in-app trade -- the exchange happens off Barter, so offer/trade-complete
  // UI is suppressed for these connections (mirrors the server-side guards in
  // _offer_create_core/_complete_trade_core).
  const isCuratorConnection = connection?.otherUser.isCurator === true;

  const handleConfirmBlock = async () => {
    if (!connectionId || !otherUserId || !user) return;
    setBlockSubmitting(true);
    try {
      await blockUser({ blockedId: otherUserId });
      await ConnectionService.endConnection(connectionId, user.id);
      toast.success(`${otherUsername} blocked`);
      navigate("/chat");
    } catch {
      toast.error("Couldn't block this user. Please try again.");
    } finally {
      setBlockSubmitting(false);
      setBlockConfirmOpen(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportReason || !connection || !otherUserId) return;
    // Attach one of the connection's item interests when one's available --
    // the other person's item, since they're who's being reported. Falls
    // back to a user-only report otherwise.
    const reportedItemId = connection.itemInterests[0]?.theirItem?.id ?? connection.itemInterests[0]?.myItem?.id;
    try {
      const { error } = await createReport({
        reportedItemId,
        reportedUserId: otherUserId,
        reason: reportReason,
        description: reportText.trim() || undefined,
      });
      if (error) {
        toast.error("Failed to submit report");
        return;
      }
      toast.success("Report submitted — we'll review this shortly");
      setReportOpen(false);
      setReportReason(null);
      setReportText("");
    } catch {
      toast.error("Failed to submit report");
    }
  };

  const handleOpenTradeComplete = () => {
    setMenuOpen(false);
    if (connectionId) navigate(`/chat/${connectionId}/trade-complete`);
  };

  const handleOpenClaimModal = () => {
    setMenuOpen(false);
    setSelectedClaimItemId(eligibleGiveawayItems.length === 1 ? eligibleGiveawayItems[0].id : null);
    setClaimModalOpen(true);
  };

  const handleConfirmClaim = async () => {
    if (!selectedClaimItemId || !connectionId || !user) return;
    setClaimSubmitting(true);
    try {
      const { error } = await TradeCompletionService.claimGiveawayCompletion(
        user.id,
        connectionId,
        selectedClaimItemId
      );
      if (error) {
        showError(error);
        return;
      }
      toast.success("Claimed! Waiting for the lister to approve.");
      setClaimModalOpen(false);
      setSelectedClaimItemId(null);
      if (connectionId) queryClient.invalidateQueries({ queryKey: ["messages", connectionId] });
      queryClient.invalidateQueries({ queryKey: ["tradeCompletionsByIds"] });
    } catch {
      toast.error("Couldn't claim this item. Please try again.");
    } finally {
      setClaimSubmitting(false);
    }
  };

  const referencedItems = connection
    ? Array.from(
        new Map(
          connection.itemInterests
            .flatMap((i) => [i.myItem, i.theirItem])
            .filter((item): item is NonNullable<typeof item> => !!item)
            .map((item) => [item.id, item])
        ).values()
      )
    : [];

  const itemLabel =
    referencedItems.length > 0 ? (
      <span>
        {referencedItems.map((item, idx) => (
          <React.Fragment key={item.id}>
            {idx > 0 && " · "}
            <button
              type="button"
              onClick={() => navigate(`/item/${item.id}`)}
              className="text-xs text-[oklch(50%_0.02_90)] underline underline-offset-2"
            >
              {item.listingType === "giveaway" ? `${item.title} (Giveaway)` : item.title}
            </button>
          </React.Fragment>
        ))}
      </span>
    ) : undefined;

  // A giveaway item only ever shows as theirItem from the non-owner's
  // perspective (see connectionService.ts's mine/theirs fix) -- so this
  // filter alone is sufficient to mean "I'm the recipient, not the lister."
  const eligibleGiveawayItems = connection
    ? Array.from(
        new Map(
          connection.itemInterests
            .map((i) => i.theirItem)
            .filter((item): item is NonNullable<typeof item> => !!item && item.listingType === "giveaway")
            .map((item) => [item.id, item])
        ).values()
      )
    : [];

  // Messages come back newest-first from getConnectionMessages; the
  // thread reads top-to-bottom oldest-first.
  const orderedMessages = [...messages].reverse();

  return (
    <div className="max-w-md mx-auto chat-thread-viewport flex flex-col pt-16">
      <BackBar
        title={connection?.otherUser.username ?? "Chat"}
        subtitle={itemLabel}
        onBack={() => navigate("/chat")}
        helpItems={[
          "Tap the camera to share a photo, the pin to share your location, or the handshake to propose a trade or mark it complete",
          "Block or report from the menu in the top right if something's wrong",
        ]}
        action={
          <div className="relative flex-shrink-0">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5">
              <MoreVertical className="w-5 h-5 text-[oklch(22%_0.02_100)]" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-[oklch(88%_0.015_90)] overflow-hidden z-20">
                  {!isCuratorConnection && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[oklch(88%_0.015_90)]">
                      <button
                        onClick={handleOpenTradeComplete}
                        className="flex-1 text-left text-[13px] font-bold text-barter-700"
                      >
                        Mark trade complete
                      </button>
                      <InfoTooltip
                        text="Record that you've exchanged items in person. The other person gets 7 days to dispute it before it's final."
                        label="Mark trade complete"
                      />
                    </div>
                  )}
                  {!isCuratorConnection && eligibleGiveawayItems.length > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[oklch(88%_0.015_90)]">
                      <button
                        onClick={handleOpenClaimModal}
                        className="flex-1 text-left text-[13px] font-bold text-barter-700"
                      >
                        Claim giveaway
                      </button>
                      <InfoTooltip
                        text="Let the lister know you'd like this item. They'll need to approve your claim before it's yours."
                        label="Claim giveaway"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[oklch(88%_0.015_90)]">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setBlockConfirmOpen(true);
                      }}
                      className="flex-1 text-left text-[13px] font-bold text-[oklch(50%_0.15_30)]"
                    >
                      Block {otherUsername}
                    </button>
                    <InfoTooltip
                      text="Stops this person from messaging you or seeing your listings, and removes their listings from your feed."
                      label="Block"
                    />
                  </div>
                  <div className="flex items-center justify-between px-3.5 py-2.5">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setReportOpen(true);
                      }}
                      className="flex-1 text-left text-[13px] font-bold text-[oklch(50%_0.15_30)]"
                    >
                      Report
                    </button>
                    <InfoTooltip
                      text="Flag this person or their listing for a moderator to review."
                      label="Report"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        }
      />

      {isCuratorConnection && (
        <div className="flex-shrink-0 px-4 py-2 bg-barter-50 border-b border-[oklch(88%_0.015_90)] text-[11px] font-bold text-barter-700 text-center">
          Curated external listing, the exchange happens off Barter.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-[oklch(96%_0.014_92)]">
        {(connectionLoading || messagesLoading) && (
          <div className="py-10">
            <LoadingSpinner />
          </div>
        )}
        {!messagesLoading &&
          orderedMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isMine={message.senderId === user?.id}
              currentUserId={user?.id}
              tradeCompletionsById={tradeCompletionsById}
              onDispute={setDisputeTradeCompletionId}
              onApprove={setApproveTradeCompletionId}
              offersById={offersById}
              onAcceptOffer={handleAcceptOffer}
              onModifyOffer={handleModifyOffer}
            />
          ))}
        <div ref={bottomRef} />
      </div>

      {currentOffer?.status === "agreed" && (
        <AgreedOfferStrip
          offer={currentOffer}
          currentUserId={user?.id}
          onConfirmNow={handleConfirmNow}
          onWithdraw={() => setWithdrawConfirmOpen(true)}
        />
      )}

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
          onClick={() => setLocationPickerOpen(true)}
          disabled={locationSharing}
          title="Share a location"
          className="w-8 h-8 rounded-full flex items-center justify-center text-[oklch(45%_0.02_95)] hover:bg-[oklch(94%_0.012_90)] disabled:opacity-40 flex-shrink-0"
        >
          {locationSharing ? (
            <div className="w-4 h-4 border-2 border-[oklch(88%_0.015_90)] border-t-barter-600 rounded-full animate-spin" />
          ) : (
            <MapPin className="w-[18px] h-[18px]" />
          )}
        </button>
        {!isCuratorConnection && (
          <div className="relative flex-shrink-0">
            <button
              onClick={handleOpenOfferComposer}
              disabled={!!currentOffer}
              title={currentOffer ? "This connection already has an active offer" : "Propose a trade"}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[16px] hover:bg-[oklch(94%_0.012_90)] disabled:opacity-40"
            >
              🤝
            </button>
            <div className="absolute -top-1 -right-1 bg-white rounded-full">
              <InfoTooltip
                text="Propose a trade — pick items from both sides, and the other person can accept or suggest changes."
                label="Propose a trade"
              />
            </div>
          </div>
        )}
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
          className="flex-1 px-3.5 py-2.5 rounded-full bg-[oklch(94%_0.012_90)] text-[16px] text-[oklch(22%_0.02_100)] placeholder:text-[oklch(52%_0.02_90)] outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sendMessageLoading}
          className="w-8 h-8 rounded-full bg-barter-600 flex items-center justify-center text-white flex-shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {blockConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]" onClick={() => setBlockConfirmOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-4">Block {otherUsername}?</div>
            <button
              onClick={() => setBlockConfirmOpen(false)}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2"
            >
              Keep chatting
            </button>
            <button
              onClick={handleConfirmBlock}
              disabled={blockSubmitting}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-50"
            >
              {blockSubmitting ? "Blocking…" : `Block ${otherUsername}`}
            </button>
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-[oklch(99%_0.006_95)] flex flex-col">
          <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-[oklch(88%_0.015_90)]">
            <button onClick={() => setReportOpen(false)} className="p-1 -ml-1">
              <X className="w-5 h-5 text-[oklch(22%_0.02_100)]" />
            </button>
            <div className="text-base font-bold text-[oklch(22%_0.02_100)]">Report {otherUsername}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4.5">
            <div className="text-[13px] text-[oklch(45%_0.02_95)] mb-4.5">What's the issue?</div>
            <div className="flex flex-col gap-2 mb-5">
              {REPORT_REASONS.map(({ value, label }) => {
                const selected = reportReason === value;
                return (
                  <button
                    key={value}
                    onClick={() => setReportReason(value)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left ${
                      selected ? "border-barter-600" : "border-[oklch(88%_0.015_90)]"
                    }`}
                  >
                    <span
                      className={`w-[18px] h-[18px] rounded-full border flex-shrink-0 flex items-center justify-center ${
                        selected ? "border-barter-600" : "border-[oklch(80%_0.015_90)]"
                      }`}
                    >
                      {selected && <span className="w-[9px] h-[9px] rounded-full bg-barter-600" />}
                    </span>
                    <span className="text-sm font-semibold text-[oklch(22%_0.02_100)]">{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] font-bold text-[oklch(45%_0.02_95)] tracking-wide mb-2">
              ADDITIONAL CONTEXT (OPTIONAL)
            </div>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              placeholder="Add any details that might help us review this…"
              className="w-full min-h-[90px] px-3.5 py-3 rounded-2xl border border-[oklch(88%_0.015_90)] text-[13.5px] text-[oklch(22%_0.02_100)] resize-y"
            />
          </div>
          <div className="flex-shrink-0 px-5 pt-3.5 pb-5 border-t border-[oklch(88%_0.015_90)]">
            <button
              onClick={handleSubmitReport}
              disabled={!reportReason || createReportLoading}
              className="w-full py-3.5 rounded-2xl bg-[oklch(50%_0.15_30)] text-white text-sm font-bold disabled:opacity-50"
            >
              {createReportLoading ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </div>
      )}

      {disputeTradeCompletionId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]"
            onClick={() => !disputeSubmitting && setDisputeTradeCompletionId(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Dispute this trade?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] mb-4">
              A moderator will review this trade completion. Let them know what went wrong (optional).
            </div>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="What happened? (optional)"
              className="w-full min-h-[80px] px-3.5 py-3 rounded-2xl border border-[oklch(88%_0.015_90)] text-[13.5px] text-[oklch(22%_0.02_100)] resize-y mb-4"
            />
            <button
              onClick={handleConfirmDispute}
              disabled={disputeSubmitting}
              className="w-full py-3.5 rounded-xl bg-[oklch(50%_0.15_30)] text-white text-sm font-bold mb-2 disabled:opacity-50"
            >
              {disputeSubmitting ? "Filing dispute…" : "Dispute this trade"}
            </button>
            <button
              onClick={() => setDisputeTradeCompletionId(null)}
              disabled={disputeSubmitting}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(45%_0.02_95)] text-sm font-bold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {approveTradeCompletionId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]"
            onClick={() => !approveSubmitting && setApproveTradeCompletionId(null)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Approve this claim?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] mb-4">
              This finalizes the giveaway and can't be undone. If anyone else claimed the same item, their claim will
              be closed out automatically.
            </div>
            <button
              onClick={handleConfirmApprove}
              disabled={approveSubmitting}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-50"
            >
              {approveSubmitting ? "Approving…" : "Approve claim"}
            </button>
            <button
              onClick={() => setApproveTradeCompletionId(null)}
              disabled={approveSubmitting}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(45%_0.02_95)] text-sm font-bold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {claimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]"
            onClick={() => !claimSubmitting && setClaimModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Claim this giveaway?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] mb-4">
              The lister will need to approve your claim before it's final.
            </div>
            {eligibleGiveawayItems.length > 1 && (
              <div className="space-y-2 mb-4">
                {eligibleGiveawayItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedClaimItemId(item.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-[13px] font-semibold ${
                      selectedClaimItemId === item.id
                        ? "border-barter-600 bg-barter-50 text-barter-800"
                        : "border-[oklch(88%_0.015_90)] text-[oklch(22%_0.02_100)]"
                    }`}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handleConfirmClaim}
              disabled={claimSubmitting || !selectedClaimItemId}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-50"
            >
              {claimSubmitting ? "Claiming…" : "Claim giveaway"}
            </button>
            <button
              onClick={() => setClaimModalOpen(false)}
              disabled={claimSubmitting}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(45%_0.02_95)] text-sm font-bold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {withdrawConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]"
            onClick={() => !withdrawSubmitting && setWithdrawConfirmOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Withdraw this trade?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] mb-4">
              {otherUsername} will be notified, and both items return to Discover. This can't be undone.
            </div>
            <button
              onClick={handleConfirmWithdraw}
              disabled={withdrawSubmitting}
              className="w-full py-3.5 rounded-xl bg-[oklch(50%_0.15_30)] text-white text-sm font-bold mb-2 disabled:opacity-50"
            >
              {withdrawSubmitting ? "Withdrawing…" : "Withdraw"}
            </button>
            <button
              onClick={() => setWithdrawConfirmOpen(false)}
              disabled={withdrawSubmitting}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(45%_0.02_95)] text-sm font-bold disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <LocationSharePicker
        isOpen={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        onShareCurrent={handleShareLocation}
        currentLocationSharing={locationSharing}
        onSelectPlace={handleSelectSearchedPlace}
      />
    </div>
  );
};
