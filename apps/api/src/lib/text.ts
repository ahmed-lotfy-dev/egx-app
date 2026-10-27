const ARABIC_DIACRITICS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/**
 * Normalizes a name for Arabic search. Removes diacritics and tatweel,
 * unifies alef/ya/ta-marbuta variants, lowercases Latin text, and strips
 * punctuation. The same function runs at ingestion and query time so stored
 * and searched values always match.
 */
export function normalizeArabic(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/[\u0649\u064A]/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEnglish(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSearch(input: string): string {
  return normalizeArabic(normalizeEnglish(input));
}

export function hasArabic(input: string): boolean {
  return /[\u0600-\u06FF]/.test(input);
}
