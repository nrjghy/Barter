import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { trackEvent } from "../lib/analytics";
import {
  ListingTextSource,
  getListingText,
  hasTranslation,
  primaryBrowserLanguage,
  resolveShowEnglish,
  type ListingText,
} from "../utils/listingLanguage";

// Which language listing text is shown in. State lives for the session only:
// the durable preference is the account setting (users.show_listings_in_english).
// A per-listing switch overrides the Discover switch, which overrides the account setting.

type TrackedItem = ListingTextSource & { id: string };

interface ListingLanguageContextValue {
  /** Text to display for a listing, honoring all overrides. */
  getText: (item: TrackedItem) => ListingText;
  /** Switch one listing between English and its original language. */
  setItemShowEnglish: (item: TrackedItem, showEnglish: boolean, surface: "card" | "detail") => void;
  /** Switch every listing at once for this session (clears per-listing choices). */
  setBulkShowEnglish: (showEnglish: boolean) => void;
  /** Drop the Discover and per-listing choices so the account setting applies again. */
  clearOverrides: () => void;
}

const ListingLanguageContext = createContext<ListingLanguageContextValue | undefined>(undefined);

export const ListingLanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [perItem, setPerItem] = useState<Record<string, boolean>>({});
  const [bulk, setBulk] = useState<boolean | null>(null);
  const browserLanguage = useMemo(() => primaryBrowserLanguage(), []);
  const account = user?.showListingsInEnglish ?? null;

  const showEnglishFor = useCallback(
    (item: TrackedItem) =>
      resolveShowEnglish({
        perItem: perItem[item.id],
        bulk,
        account,
        originalLanguage: item.originalLanguage ?? "",
        browserLanguage,
      }),
    [perItem, bulk, account, browserLanguage]
  );

  const getText = useCallback(
    (item: TrackedItem) => getListingText(item, hasTranslation(item) ? showEnglishFor(item) : false),
    [showEnglishFor]
  );

  const setItemShowEnglish = useCallback(
    (item: TrackedItem, showEnglish: boolean, surface: "card" | "detail") => {
      setPerItem((prev) => ({ ...prev, [item.id]: showEnglish }));
      trackEvent("listing_translation_toggled", {
        itemId: item.id,
        showing: showEnglish ? "english" : "original",
        originalLanguage: item.originalLanguage,
        surface,
      });
    },
    []
  );

  const setBulkShowEnglish = useCallback((showEnglish: boolean) => {
    setBulk(showEnglish);
    setPerItem({});
    trackEvent("listing_translation_bulk_toggled", {
      showing: showEnglish ? "english" : "original",
      surface: "discover",
    });
  }, []);

  const clearOverrides = useCallback(() => {
    setBulk(null);
    setPerItem({});
  }, []);

  const value = useMemo(
    () => ({ getText, setItemShowEnglish, setBulkShowEnglish, clearOverrides }),
    [getText, setItemShowEnglish, setBulkShowEnglish, clearOverrides]
  );

  return <ListingLanguageContext.Provider value={value}>{children}</ListingLanguageContext.Provider>;
};

export const useListingLanguage = (): ListingLanguageContextValue => {
  const context = useContext(ListingLanguageContext);
  if (!context) throw new Error("useListingLanguage must be used within a ListingLanguageProvider");
  return context;
};
