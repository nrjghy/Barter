import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Search } from "lucide-react";
import toast from "react-hot-toast";
import countryToCurrency from "country-to-currency";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

interface PlaceSuggestion {
  label: string;
  lat: number;
  lng: number;
}

export const LocationPrompt: React.FC = () => {
  const { updateProfile } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const busy = sharing || selecting;

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }

    setGpsError(null);
    setSharing(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke("reverse-geocode", {
          body: { lat: latitude, lng: longitude },
        });
        const { location, countryCode } = geocodeData ?? {};
        const locationString = geocodeError || !location ? "Unknown location" : location;
        const defaultCurrency = countryCode
          ? countryToCurrency[countryCode as keyof typeof countryToCurrency] ?? "USD"
          : "USD";

        const { error } = await updateProfile({
          location: locationString,
          latitude,
          longitude,
          defaultCurrency,
        });

        setSharing(false);

        if (error) {
          toast.error("Failed to update location");
          return;
        }

        toast.success("Location shared!");
      },
      (error) => {
        setSharing(false);
        if (error.code === error.PERMISSION_DENIED) {
          setGpsError("Location permission denied. Enable it in your browser settings to share your location.");
        } else {
          setGpsError("Couldn't get your location. Please try again.");
        }
      }
    );
  };

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
          body: { query: trimmed },
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

  const handleSelectPlace = async (place: PlaceSuggestion) => {
    setSelecting(true);

    // Reverse geocode the suggestion's coordinates through the same
    // Edge Function the GPS path uses, so a selected suggestion is
    // normalized to city-level location text instead of storing the
    // raw (often neighborhood-level) suggestion label.
    let locationString = "Unknown location";
    let defaultCurrency = "USD";
    try {
      const { data: geocodeData, error: geocodeError } = await supabase.functions.invoke("reverse-geocode", {
        body: { lat: place.lat, lng: place.lng },
      });
      if (!geocodeError && geocodeData?.location) {
        locationString = geocodeData.location;
      }
      const countryCode = geocodeData?.countryCode;
      if (countryCode) {
        defaultCurrency = countryToCurrency[countryCode as keyof typeof countryToCurrency] ?? "USD";
      }
    } catch {
      // fall back to "Unknown location" / "USD" already set above
    }

    const { error } = await updateProfile({
      location: locationString,
      latitude: place.lat,
      longitude: place.lng,
      defaultCurrency,
    });

    setSelecting(false);

    if (error) {
      toast.error("Failed to update location");
      return;
    }

    toast.success("Location shared!");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 overflow-y-auto p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl max-w-md w-full overflow-hidden flex flex-col mx-auto my-8"
        >
          <div className="px-5 pt-6 pb-4 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-barter-100 flex items-center justify-center text-barter-600 mb-3">
              <MapPin className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-1.5">Add your location to get started</h2>
            <p className="text-[13.5px] text-gray-600">
              Barter shows you items from people nearby, since trades happen in person. We need your location to
              match you with listings in your area, without it we can't show you anything relevant.
            </p>
          </div>

          <div className="px-5 pt-1 pb-5 flex flex-col gap-2">
            <button
              onClick={handleShareLocation}
              disabled={busy}
              className="w-full py-3.5 rounded-2xl bg-barter-600 hover:bg-barter-700 text-white text-sm font-bold disabled:opacity-50"
            >
              {sharing ? "Sharing…" : "Share location"}
            </button>
            {gpsError && <p className="text-xs font-semibold text-red-600 text-center">{gpsError}</p>}

            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mt-3 mb-1">
              Or search for a place
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-300">
              <Search className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                disabled={busy}
                placeholder="Search a place or address"
                className="flex-1 bg-transparent text-[16px] focus:outline-none disabled:opacity-50"
              />
            </div>

            {(searching || suggestions.length > 0) && (
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl">
                {searching && <div className="text-[12px] text-gray-500 py-3 text-center">Searching…</div>}
                {!searching &&
                  suggestions.map((place, index) => (
                    <button
                      key={`${place.label}-${index}`}
                      type="button"
                      onClick={() => handleSelectPlace(place)}
                      disabled={busy}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-100 last:border-b-0 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="text-[13px] text-gray-700 truncate">{place.label}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
