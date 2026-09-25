import en, { type TranslationKey } from "./en";
import es from "./es";
import fr from "./fr";
import hi from "./hi";
import pt from "./pt";
import zh from "./zh";

export type { TranslationKey };
export type LanguageCode = "en" | "es" | "hi" | "pt" | "zh" | "fr";

export const LANGUAGES: { code: LanguageCode; nativeName: string; englishName: string }[] = [
  { code: "en", nativeName: "English", englishName: "English" },
  { code: "es", nativeName: "Español", englishName: "Spanish" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese" },
  { code: "zh", nativeName: "中文", englishName: "Chinese" },
  { code: "fr", nativeName: "Français", englishName: "French" },
];

export const dictionaries: Record<LanguageCode, Record<TranslationKey, string>> = { en, es, hi, pt, zh, fr };
