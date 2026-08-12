import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MoreVertical, Package } from "lucide-react";
import { useItems } from "../hooks/useItems";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { shareItem } from "../utils/share";
import type { ItemData } from "../services/types";

type ItemStatus = "active" | "cancelled" | "traded" | "expired";

const STATUS_META: Record<ItemStatus, { label: string; bg: string; color: string }> = {
  active: { label: "Active", bg: "oklch(93% 0.035 145)", color: "oklch(34% 0.09 148)" },
  cancelled: { label: "Cancelled", bg: "oklch(90% 0.01 90)", color: "oklch(45% 0.02 90)" },
  traded: { label: "Traded", bg: "oklch(90% 0.05 230)", color: "oklch(38% 0.1 230)" },
  expired: { label: "Expired", bg: "oklch(90% 0.06 60)", color: "oklch(42% 0.13 50)" },
};

const ListingRow: React.FC<{
  item: ItemData;
  onOpenDetail: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onRelist: () => void;
  highlighted?: boolean;
}> = ({ item, onOpenDetail, onEdit, onCancel, onRelist, highlighted }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const status = (item.status ?? "active") as ItemStatus;
  const meta = STATUS_META[status];
  const thumbnail = item.imageUrls?.[0];

  return (
    <div
      className={`flex items-center gap-3 py-3 border-t border-[oklch(88%_0.015_90)] relative transition-colors duration-500 ${
        highlighted ? "bg-[oklch(93%_0.035_145)]" : ""
      }`}
    >
      <button onClick={onOpenDetail} className="w-[52px] h-[52px] rounded-[10px] flex-shrink-0 overflow-hidden bg-[oklch(90%_0.02_90)]">
        {thumbnail ? (
          <img src={thumbnail} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[oklch(60%_0.02_90)]">
            <Package className="w-5 h-5" />
          </div>
        )}
      </button>
      <button onClick={onOpenDetail} className="flex-1 min-w-0 text-left">
        <div className="text-sm font-semibold text-[oklch(22%_0.02_100)] truncate">{item.title}</div>
        <div
          className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold"
          style={{ background: meta.bg, color: meta.color }}
        >
          {meta.label}
        </div>
      </button>
      <button onClick={() => shareItem(item)} className="p-1 text-[oklch(45%_0.02_95)] flex-shrink-0">
        {/* Share icon: three nodes + connecting lines, matching the approved mockup's custom glyph */}
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="11.5" cy="3.3" r="1.8" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="3.6" cy="7.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="11.5" cy="11.7" r="1.8" stroke="currentColor" strokeWidth="1.3" />
          <line x1="5.2" y1="6.6" x2="9.9" y2="4.1" stroke="currentColor" strokeWidth="1.3" />
          <line x1="5.2" y1="8.4" x2="9.9" y2="10.9" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>

      <button onClick={() => setMenuOpen((v) => !v)} className="w-7 h-7 flex items-center justify-center text-[oklch(45%_0.02_95)] flex-shrink-0">
        <MoreVertical className="w-4 h-4" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-11 right-2 w-[150px] bg-[oklch(99%_0.006_95)] border border-[oklch(88%_0.015_90)] rounded-xl shadow-lg overflow-hidden z-40">
            <button
              onClick={onOpenDetail}
              className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-[oklch(22%_0.02_100)] border-b border-[oklch(88%_0.015_90)]"
            >
              View details
            </button>
            {status === "active" ? (
              <>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-[oklch(22%_0.02_100)] border-b border-[oklch(88%_0.015_90)]"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onCancel();
                  }}
                  className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold text-[oklch(50%_0.15_30)]"
                >
                  Cancel listing
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRelist();
                }}
                className="w-full text-left px-3.5 py-2.5 text-[13px] font-bold text-barter-700"
              >
                Relist
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export const MyStuff: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userItems, userItemsLoading, cancelItem, cancelItemLoading } = useItems();
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [confirmingItem, setConfirmingItem] = useState<ItemData | null>(null);

  // Post-publish flow (PRD §13): after Add/Edit, land here with the affected
  // listing briefly highlighted rather than a separate confirmation screen.
  const [highlightItemId, setHighlightItemId] = useState<string | undefined>(
    (location.state as { highlightItemId?: string } | null)?.highlightItemId
  );

  useEffect(() => {
    if (!highlightItemId) return;
    const timeout = setTimeout(() => setHighlightItemId(undefined), 3000);
    return () => clearTimeout(timeout);
  }, [highlightItemId]);

  const visibleItems = filter === "active" ? userItems.filter((i) => (i.status ?? "active") === "active") : userItems;

  const handleConfirmCancel = async () => {
    if (!confirmingItem) return;
    try {
      await cancelItem(confirmingItem.id);
    } finally {
      setConfirmingItem(null);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-4">
      <button
        onClick={() => navigate("/add")}
        className="w-full py-3.5 rounded-2xl bg-barter-600 text-white text-[15px] font-bold mb-4"
      >
        + Add a listing
      </button>

      <div className="flex gap-1.5 p-1 rounded-xl bg-[oklch(93%_0.012_90)] mb-4">
        <button
          onClick={() => setFilter("active")}
          className={`flex-1 text-center py-2 rounded-lg text-[13px] font-bold ${
            filter === "active" ? "bg-[oklch(99%_0.006_95)] text-[oklch(22%_0.02_100)]" : "text-[oklch(52%_0.02_90)]"
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setFilter("all")}
          className={`flex-1 text-center py-2 rounded-lg text-[13px] font-bold ${
            filter === "all" ? "bg-[oklch(99%_0.006_95)] text-[oklch(22%_0.02_100)]" : "text-[oklch(52%_0.02_90)]"
          }`}
        >
          All
        </button>
      </div>

      {userItemsLoading && (
        <div className="py-16">
          <LoadingSpinner />
        </div>
      )}

      {!userItemsLoading && visibleItems.length === 0 && (
        <div className="text-center py-10 text-[13px] font-semibold text-[oklch(52%_0.02_90)]">
          {filter === "active" ? "No active listings right now." : "You haven't posted anything yet."}
        </div>
      )}

      {!userItemsLoading &&
        visibleItems.map((item) => (
          <ListingRow
            key={item.id}
            item={item}
            onOpenDetail={() => navigate(`/item/${item.id}`)}
            onEdit={() => navigate(`/edit/${item.id}`)}
            onCancel={() => setConfirmingItem(item)}
            onRelist={() => navigate("/add", { state: { relistFrom: item } })}
            highlighted={item.id === highlightItemId}
          />
        ))}

      {confirmingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={() => setConfirmingItem(null)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7">
            <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-1.5">Cancel this listing?</div>
            <div className="text-[13px] text-[oklch(45%_0.02_95)] leading-relaxed mb-4">
              "{confirmingItem.title}" — this can't be undone. Anyone you're chatting with about it will be notified
              it's no longer available.
            </div>
            <button
              onClick={() => setConfirmingItem(null)}
              className="w-full py-3.5 rounded-xl bg-barter-600 text-white text-sm font-bold mb-2"
            >
              Keep listing
            </button>
            <button
              onClick={handleConfirmCancel}
              disabled={cancelItemLoading}
              className="w-full py-3.5 rounded-xl bg-transparent text-[oklch(50%_0.15_30)] text-sm font-bold disabled:opacity-50"
            >
              {cancelItemLoading ? "Cancelling…" : "Cancel listing"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
