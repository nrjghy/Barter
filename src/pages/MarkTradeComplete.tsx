import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Package, ChevronRight } from "lucide-react";
import { useConnection } from "../hooks/useConnections";
import { useUserItems } from "../hooks/useItems";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { BackBar } from "../components/BackBar";
import { toast } from "react-hot-toast";
import { TradeCompletionService, NotificationService } from "../services";
import type { ItemData } from "../services/types";
import { trackEvent } from "../lib/analytics";

// Step 4a built the item picker + confirmation screen UI, matching the
// approved mockup exactly (checklists, bottom-sheet confirm, dispute-date
// copy). Step 4b (this pass) wires "Confirm trade complete" to the new
// complete_trade RPC -- required because marking someone else's item as
// traded can't be done via a plain client update, items' RLS only lets
// the owner update their own row.

type Step = "select" | "confirm";

// Tapping an item's view affordance navigates away to /item/:id, which
// unmounts this component -- plain useState would lose the in-progress
// selection on the way back. sessionStorage survives that round trip
// without needing to touch the toggle logic itself.
const selectionStorageKey = (connectionId?: string) => `markTradeComplete:selections:${connectionId ?? ""}`;

function loadStoredSelections(connectionId?: string): { mine: string[]; theirs: string[] } | null {
  if (!connectionId) return null;
  try {
    const raw = sessionStorage.getItem(selectionStorageKey(connectionId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function previewDisputeDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

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
}> = ({ label, items, loading, selected, onToggle }) => {
  const navigate = useNavigate();
  return (
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
            <div
              key={item.id}
              className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl border ${
                checked ? "border-barter-600 bg-barter-100" : "border-[oklch(88%_0.015_90)] bg-transparent"
              }`}
            >
              <button onClick={() => onToggle(item.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
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
                <span className="text-sm font-semibold text-[oklch(22%_0.02_100)] truncate">{item.title}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/item/${item.id}`);
                }}
                aria-label={`View ${item.title}`}
                className="p-1.5 -m-1.5 flex-shrink-0 text-[oklch(55%_0.02_95)] hover:text-[oklch(35%_0.02_95)]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const MarkTradeComplete: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { connection, loading: connectionLoading } = useConnection(connectionId);
  const { items: myItems, loading: myItemsLoading } = useUserItems(user?.id);
  const { items: theirItems, loading: theirItemsLoading } = useUserItems(connection?.otherUser.id);

  // Passed by ChatThread's pinned-strip "Confirm Now" button as a flat
  // array of item ids covering both sides of the agreed offer -- absent
  // when reaching this screen the normal way (chat "···" menu).
  const offerItemIds = (location.state as { offerItemIds?: string[] } | null)?.offerItemIds;
  const hasOfferState = !!offerItemIds && offerItemIds.length > 0;

  const [step, setStep] = useState<Step>("select");
  const [selectedMine, setSelectedMine] = useState<Set<string>>(
    () => new Set(loadStoredSelections(connectionId)?.mine ?? [])
  );
  const [selectedTheirs, setSelectedTheirs] = useState<Set<string>>(
    () => new Set(loadStoredSelections(connectionId)?.theirs ?? [])
  );
  // Restoring an in-progress selection counts as already "prefilled" --
  // skips the agreed-offer prefill effect below so it doesn't clobber
  // edits the user made before navigating to an item's detail page.
  const [prefilled, setPrefilled] = useState(() => !!loadStoredSelections(connectionId));
  const [submitting, setSubmitting] = useState(false);

  const myActiveItems = myItems.filter((i) => (i.status ?? "active") === "active");
  const theirActiveItems = theirItems; // RLS already limits a non-owner's view to active items only

  // Pre-fill both sides from the agreed offer's item ids, once both item
  // lists have loaded. This is a starting point, not a binding source of
  // truth -- what actually changed hands can differ from what was agreed
  // -- so it only seeds initial state (guarded by `prefilled`) and never
  // overrides the user's own subsequent edits.
  useEffect(() => {
    if (!offerItemIds || offerItemIds.length === 0 || prefilled || myItemsLoading || theirItemsLoading) return;
    const myActiveIds = new Set(myItems.filter((i) => (i.status ?? "active") === "active").map((i) => i.id));
    const theirIds = new Set(theirItems.map((i) => i.id));
    setSelectedMine(new Set(offerItemIds.filter((id) => myActiveIds.has(id))));
    setSelectedTheirs(new Set(offerItemIds.filter((id) => theirIds.has(id))));
    setPrefilled(true);
  }, [offerItemIds, prefilled, myItemsLoading, theirItemsLoading, myItems, theirItems]);

  useEffect(() => {
    if (!connectionId) return;
    sessionStorage.setItem(
      selectionStorageKey(connectionId),
      JSON.stringify({ mine: [...selectedMine], theirs: [...selectedTheirs] })
    );
  }, [connectionId, selectedMine, selectedTheirs]);

  const toggleMine = (id: string) =>
    setSelectedMine((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleTheirs = (id: string) =>
    setSelectedTheirs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const hasSelection = selectedMine.size > 0 || selectedTheirs.size > 0;
  const otherUsername = connection?.otherUser.username ?? "this user";
  const selectedSummary = [summarize(myActiveItems, selectedMine), summarize(theirActiveItems, selectedTheirs)]
    .filter(Boolean)
    .join(" and ");

  const handleConfirm = async () => {
    if (!connectionId || !connection || !user) return;

    const itemIds = [...selectedMine, ...selectedTheirs];
    setSubmitting(true);
    try {
      const { error } = await TradeCompletionService.completeTrade(connectionId, itemIds);

      if (error) {
        toast.error(error.message || "Couldn't complete the trade. Please try again.");
        return;
      }

      // Best-effort: the trade itself is already done at this point (the
      // RPC succeeded), so a failure here shouldn't be shown as if the
      // whole action failed, it would just mean the other person doesn't
      // get a notification-center entry for it.
      try {
        await NotificationService.createTradeCompletedNotification(
          connection.otherUser.id,
          connectionId,
          user.username
        );
      } catch {
        // Swallowed on purpose -- see comment above.
      }

      if (connectionId) sessionStorage.removeItem(selectionStorageKey(connectionId));
      toast.success("Trade marked complete");
      // PRD §17 core conversion funnel, step 6 (final): trade marked complete.
      trackEvent("trade_marked_complete", { connectionId, itemCount: itemIds.length });
      navigate(`/chat/${connectionId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col bg-[oklch(99%_0.006_95)] pt-16">
      <BackBar
        title="Mark trade complete"
        onBack={() => {
          if (connectionId) sessionStorage.removeItem(selectionStorageKey(connectionId));
          navigate(`/chat/${connectionId}`);
        }}
      />

      {connectionLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-5 py-4.5">
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-5">
              Select the item(s) that were actually exchanged with {otherUsername}.
            </div>
            {hasOfferState && (
              <div className="p-3.5 rounded-xl bg-barter-50 border border-barter-200 mb-5">
                <p className="text-[12.5px] text-barter-800 leading-relaxed">
                  Pre-filled from your agreed trade — adjust if what was actually exchanged was different.
                </p>
              </div>
            )}
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
          <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.4)]" onClick={() => !submitting && setStep("select")} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Confirm trade complete</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
              Marking <strong>{selectedSummary}</strong> as traded. These item(s) will be removed from Discover, and
              anyone else with an open connection about them will be notified. {otherUsername} will have until{" "}
              {previewDisputeDate()} to dispute this.
            </div>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2 disabled:opacity-60"
            >
              {submitting ? "Completing…" : "Confirm trade complete"}
            </button>
            <button
              onClick={() => setStep("select")}
              disabled={submitting}
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
