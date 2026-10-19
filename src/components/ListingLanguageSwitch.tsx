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
    return (
      <div className="flex items-center gap-2 text-xs text-white/80">
        {showingEnglish && <span className="font-medium">Auto-translated</span>}
        {showingEnglish && <span aria-hidden="true">·</span>}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setItemShowEnglish(item, !showingEnglish, "card");
          }}
          className="underline underline-offset-2 font-semibold text-white"
        >
          {showingEnglish ? "Show original" : "Show English"}
        </button>
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
