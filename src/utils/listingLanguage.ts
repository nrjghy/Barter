import type { ItemData } from "../services/types";

// Listing text is stored in its original language, with an automatic English
// translation beside it (items.title_en / description_en). These helpers decide
// which one to show. The UI chrome itself stays English-only.

export type ListingTextSource = Pick<
  ItemData,
  "title" | "description" | "originalLanguage" | "titleEn" | "descriptionEn"
>;

/** True when the listing was written in another language and an English version exists. */
export function hasTranslation(item: ListingTextSource): boolean {
  const lang = item.originalLanguage?.toLowerCase();
  if (!lang || lang === "en") return false;
  return Boolean(item.titleEn?.trim() || item.descriptionEn?.trim());
}

/** Primary language of the browser ("pl", "en", ...), or null if unknown. */
export function primaryBrowserLanguage(): string | null {
  if (typeof navigator === "undefined") return null;
  const first = navigator.languages?.length ? navigator.languages[0] : navigator.language;
  return first ? first.toLowerCase().split("-")[0] : null;
}

/**
 * Automatic default: show the original only when it matches the browser's
 * primary language (a Polish browser sees Polish listings as written).
 * Everyone else sees English.
 */
export function defaultShowEnglish(originalLanguage: string, browserLanguage: string | null): boolean {
  return browserLanguage !== originalLanguage.toLowerCase();
}

/**
 * Precedence, most specific first: this listing's own switch, the Discover
 * switch for this session, the account setting, then the automatic default.
 */
export function resolveShowEnglish(args: {
  perItem?: boolean;
  bulk?: boolean | null;
  account?: boolean | null;
  originalLanguage: string;
  browserLanguage: string | null;
}): boolean {
  if (args.perItem !== undefined) return args.perItem;
  if (args.bulk !== undefined && args.bulk !== null) return args.bulk;
  if (args.account !== undefined && args.account !== null) return args.account;
  return defaultShowEnglish(args.originalLanguage, args.browserLanguage);
}

export interface ListingText {
  title: string;
  description: string;
  /** Language of the text actually shown, for the lang attribute. Undefined while a translation is pending. */
  lang: string | undefined;
  /** True when an English version exists for this listing. */
  translated: boolean;
  showingEnglish: boolean;
}

/** Picks the title and description to display. Falls back to the original for any missing English field. */
export function getListingText(item: ListingTextSource, showEnglish: boolean): ListingText {
  const translated = hasTranslation(item);
  const useEnglish = translated && showEnglish;
  return {
    title: useEnglish ? item.titleEn?.trim() || item.title : item.title,
    description: useEnglish ? item.descriptionEn?.trim() || item.description : item.description,
    lang: useEnglish ? "en" : item.originalLanguage?.toLowerCase() || undefined,
    translated,
    showingEnglish: useEnglish,
  };
}

/** Name of a language written in that language ("pl" -> "Polski"), used for the switch label. */
export function nativeLanguageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) {
      return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
    }
  } catch {
    // fall through
  }
  return code.toUpperCase();
}

/** Name of a language written in English ("pl" -> "Polish"), used in "Translated automatically from Polish". */
export function englishLanguageName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    if (name && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch {
    // fall through
  }
  return code.toUpperCase();
}
