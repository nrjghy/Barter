import React from "react";
import { useListingLanguage } from "../contexts/ListingLanguageContext";
import { englishLanguageName, hasTranslation, nativeLanguageName, ListingTextSource } from "../utils/listingLanguage";

type SwitchItem = ListingTextSource & { id: string };

interface ListingLanguageSwitchProps {
  item: SwitchItem;
  /** "card" is a small inline button for Discover cards; "detail" is the full English | original control. */
  variant: "card" | "detail";
}

// Renders nothing unless the listing has an automatic English translation, so
// English listings and listings still waiting for their translation show no switch.
export const ListingLanguageSwitch: React.FC<ListingLanguageSwitchProps> = ({ item, variant }) => {
  const { getText, setItemShowEnglish } = useListingLanguage();
  if (!hasTranslation(item)) return null;

  const { showingEnglish } = getText(item);
  const originalCode = item.originalLanguage!.toLowerCase();
  const originalName = nativeLanguageName(originalCode);

  if (variant === "card") {
    // Compact EN | PL pill. Both options are always visible, so no extra label line is needed;
    // the "Translated automatically from ..." note stays on the detail page.
    const cardOptions = [
      { label: "EN", name: "English", lang: "en", english: true },
      { label: originalCode.toUpperCase(), name: originalName, lang: originalCode, english: false },
    ];
    return (
      <div
        role="group"
        aria-label="Listing language"
        className="shrink-0 inline-grid grid-cols-2 gap-0.5 p-0.5 bg-white/15 border border-white/20 rounded-full"
      >
        {cardOptions.map((option) => {
          const active = option.english === showingEnglish;
          return (
            <button
              key={option.lang}
              type="button"
              lang={option.lang}
              title={option.name}
              aria-label={option.name}
              aria-pressed={active}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!active) setItemShowEnglish(item, option.english, "card");
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                active ? "bg-white text-barter-800" : "text-white/80"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  const options: { label: string; lang: string; english: boolean }[] = [
    { label: "English", lang: "en", english: true },
    { label: originalName, lang: originalCode, english: false },
  ];

  return (
    <div>
      <div role="group" aria-label="Listing language" className="inline-grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
        {options.map((option) => {
          const active = option.english === showingEnglish;
          return (
            <button
              key={option.lang}
              type="button"
              lang={option.lang}
              aria-pressed={active}
              onClick={() => {
                if (!active) setItemShowEnglish(item, option.english, "detail");
              }}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 mt-1.5">
        {showingEnglish
          ? `Translated automatically from ${englishLanguageName(originalCode)}`
          : `Original text, written in ${englishLanguageName(originalCode)}`}
      </p>
    </div>
  );
};
