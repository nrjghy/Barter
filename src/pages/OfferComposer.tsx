import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Package } from "lucide-react";
import { useConnection } from "../hooks/useConnections";
import { useUserItems } from "../hooks/useItems";
import { useAuth } from "../hooks/useAuth";
import { useOffers, useOffersByIds } from "../hooks/useOffers";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { toast } from "react-hot-toast";
import type { ItemData } from "../services/types";

// Same picker shape as MarkTradeComplete.tsx's item-select + bottom-sheet
// confirm screen -- reused here for both creating a new offer and
// countering an existing one (routed via location.state.counterOfferId
// rather than a second file, per the confirmed scope for this task).

type Step = "select" | "confirm";

function summarize(items: ItemData[], ids: Set<string>): string {
  const titles = items.filter((i) => ids.has(i.id)).map((i) => i.title);
  if (titles.length === 0) return "";
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.slice(0, -1).join(", ")}, and ${titles[titles.length - 1]}`;
}

const ItemChecklist: React.FC<{
  label: string;
  items: ItemData[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}> = ({ label, items, loading, selected, onToggle }) => (
  <div className="mb-5">
    <div className="text-[11px] font-bold text-[oklch(45%_0.02_95)] tracking-wide mb-2.5">{label}</div>
    {loading && (
      <div className="py-4">
        <LoadingSpinner />
      </div>
    )}
    {!loading && items.length === 0 && (
      <div className="text-[13px] text-[oklch(52%_0.02_90)]">No active listings to choose from.</div>
    )}
    <div className="flex flex-col gap-2">
      {items.map((item) => {
        const checked = selected.has(item.id);
        const thumbnail = item.imageUrls?.[0];
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left ${
              checked ? "border-barter-600 bg-barter-100" : "border-[oklch(88%_0.015_90)] bg-transparent"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-[6px] border flex-shrink-0 flex items-center justify-center ${
                checked ? "bg-barter-600 border-barter-600" : "border-[oklch(80%_0.015_90)]"
              }`}
            >
              {checked && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="w-[22px] h-[22px] rounded-[5px] flex-shrink-0 overflow-hidden bg-[oklch(90%_0.02_90)] flex items-center justify-center">
              {thumbnail ? (
                <img src={thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-3 h-3 text-[oklch(60%_0.02_90)]" />
              )}
            </span>
            <span className="text-sm font-semibold text-[oklch(22%_0.02_100)]">{item.title}</span>
          </button>
        );
      })}
    </div>
  </div>
);

export const OfferComposer: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { connection, loading: connectionLoading } = useConnection(connectionId);
  const { items: myItems, loading: myItemsLoading } = useUserItems(user?.id);
  const { items: theirItems, loading: theirItemsLoading } = useUserItems(connection?.otherUser.id);
  const { createOffer, createOfferLoading, counterOffer, counterOfferLoading } = useOffers(connectionId);

  const counterOfferId = (location.state as { counterOfferId?: string } | null)?.counterOfferId;
  const isCounter = !!counterOfferId;
  const { offersById } = useOffersByIds(counterOfferId ? [counterOfferId] : []);
  const offerBeingCountered = counterOfferId ? offersById[counterOfferId] : undefined;

  const [step, setStep] = useState<Step>("select");
  const [selectedMine, setSelectedMine] = useState<Set<string>>(new Set());
  const [selectedTheirs, setSelectedTheirs] = useState<Set<string>>(new Set());
  const [prefilled, setPrefilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill both sides from the offer being countered, once its detail
  // has loaded. Only runs once (prefilled guard) so it doesn't stomp on
  // the user's own edits after the initial pre-fill.
  useEffect(() => {
    if (!isCounter || prefilled || !offerBeingCountered || !user) return;
    setSelectedMine(new Set(offerBeingCountered.items.filter((i) => i.offeredBy === user.id).map((i) => i.id)));
    setSelectedTheirs(new Set(offerBeingCountered.items.filter((i) => i.offeredBy !== user.id).map((i) => i.id)));
    setPrefilled(true);
  }, [isCounter, prefilled, offerBeingCountered, user]);

  const myActiveItems = myItems.filter((i) => (i.status ?? "active") === "active");
  const theirActiveItems = theirItems; // RLS already limits a non-owner's view to active items only

  const toggleMine = (id: string) =>
    setSelectedMine((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleTheirs = (id: string) =>
    setSelectedTheirs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  // Unlike Mark Trade Complete (either side alone is enough), an offer
  // needs something on both sides -- create_offer/counter_offer reject an
  // empty side server-side, so this just reflects that up front.
  const hasSelection = selectedMine.size > 0 && selectedTheirs.size > 0;
  const otherUsername = connection?.otherUser.username ?? "this user";
  const mySummary = summarize(myActiveItems, selectedMine);
  const theirSummary = summarize(theirActiveItems, selectedTheirs);

  const handleConfirm = async () => {
    if (!connectionId) return;

    const myItemIds = [...selectedMine];
    const theirItemIds = [...selectedTheirs];
    setSubmitting(true);
    try {
      const { error } = isCounter
        ? await counterOffer({ offerId: counterOfferId!, myItemIds, theirItemIds })
        : await createOffer({ connectionId, myItemIds, theirItemIds });

      if (error) {
        toast.error(error.message || "Couldn't send the offer. Please try again.");
        return;
      }

      toast.success(isCounter ? "Counter-offer sent" : "Offer sent");
      navigate(`/chat/${connectionId}`);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || createOfferLoading || counterOfferLoading;

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar title={isCounter ? "Modify offer" : "Propose a trade"} onBack={() => navigate(`/chat/${connectionId}`)} />

      {connectionLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4.5">
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-5">
              Select the items you'd like to trade with {otherUsername}.
            </div>
            <ItemChecklist
              label="YOUR ITEMS"
              items={myActiveItems}
              loading={myItemsLoading}
              selected={selectedMine}
              onToggle={toggleMine}
            />
            <ItemChecklist
              label="THEIR ITEMS"
              items={theirActiveItems}
              loading={theirItemsLoading}
              selected={selectedTheirs}
              onToggle={toggleTheirs}
            />
          </div>
          <div className="flex-shrink-0 px-5 pt-3.5 pb-6 border-t border-[oklch(88%_0.015_90)]">
            <button
              onClick={() => setStep("confirm")}
              disabled={!hasSelection}
              className="w-full py-3.5 rounded-2xl bg-barter-600 text-white text-sm font-bold disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </>
      )}

      {step === "confirm" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]" onClick={() => !busy && setStep("select")} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">
              {isCounter ? "Confirm counter-offer" : "Confirm trade offer"}
            </div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
              You're offering <strong>{mySummary}</strong> in exchange for <strong>{theirSummary}</strong> from{" "}
              {otherUsername}. {otherUsername} will be able to accept or modify this offer.
            </div>
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-60"
            >
              {busy ? "Sending…" : isCounter ? "Send counter-offer" : "Send offer"}
            </button>
            <button
              onClick={() => setStep("select")}
              disabled={busy}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(22%_0.02_100)] text-sm font-bold disabled:opacity-60"
            >
              Go back
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
