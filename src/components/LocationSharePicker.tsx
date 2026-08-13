import React, { useRef, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";

interface PlaceSuggestion {
  label: string;
  lat: number;
  lng: number;
}

interface LocationSharePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onShareCurrent: () => void;
  currentLocationSharing: boolean;
  onSelectPlace: (place: PlaceSuggestion) => void;
}

export const LocationSharePicker: React.FC<LocationSharePickerProps> = ({
  isOpen,
  onClose,
  onShareCurrent,
  currentLocationSharing,
  onSelectPlace,
}) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!isOpen) return null;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const trimmed = value.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await supabase.functions.invoke("places-autocomplete", {
          body: { query: trimmed, preciseLocation: true },
        });
        if (error) {
          toast.error("Failed to search locations");
          setSuggestions([]);
          return;
        }
        setSuggestions(data?.suggestions || []);
      } catch {
        toast.error("Failed to search locations");
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-[oklch(20%_0.02_100_/_0.45)]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-2xl p-5 pb-7 max-h-[80vh] flex flex-col">
        <div className="text-base font-extrabold text-[oklch(22%_0.02_100)] mb-4">Share a location</div>

        <button
          onClick={onShareCurrent}
          disabled={currentLocationSharing}
          className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-[oklch(96%_0.014_92)] mb-4 disabled:opacity-50"
        >
          <MapPin className="w-4 h-4 text-[oklch(50%_0.15_30)] flex-shrink-0" />
          <span className="text-[13px] font-bold text-[oklch(22%_0.02_100)]">
            {currentLocationSharing ? "Getting your location…" : "Share my current location"}
          </span>
        </button>

        <div className="text-[11px] font-bold text-[oklch(55%_0.02_95)] uppercase tracking-wide mb-2">
          Or search for a place
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[oklch(88%_0.015_90)] mb-2">
          <Search className="w-4 h-4 text-[oklch(55%_0.02_95)] flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search a place or address"
            className="flex-1 bg-transparent text-[13px] focus:outline-none"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {searching && <div className="text-[12px] text-[oklch(55%_0.02_95)] py-3 text-center">Searching…</div>}
          {!searching &&
            suggestions.map((place, index) => (
              <button
                key={`${place.label}-${index}`}
                onClick={() => onSelectPlace(place)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-[oklch(92%_0.012_90)] last:border-b-0"
              >
                <MapPin className="w-4 h-4 text-[oklch(55%_0.02_95)] flex-shrink-0" />
                <span className="text-[13px] text-[oklch(22%_0.02_100)] truncate">{place.label}</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};
