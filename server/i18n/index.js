import { MESSAGE_ROWS } from "./messages.js";
import { EMAIL_STRINGS } from "./emails.js";

// Same order as the columns in MESSAGE_ROWS.
export const LANGUAGES = ["en", "es", "hi", "pt", "zh", "fr"];
const GENERIC_ERROR = "Something went wrong. Please try again later.";

export const LOCALE_TAGS = { en: "en-US", es: "es-ES", hi: "hi-IN", pt: "pt-BR", zh: "zh-CN", fr: "fr-FR" };

export const normalizeLanguage = (value) => {
  const code = String(value || "").trim().toLowerCase().slice(0, 2);
  return LANGUAGES.includes(code) ? code : "en";
};

const interpolate = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));

const escapeRegex = (text) => text.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

// Plain messages are looked up directly; messages with {placeholders} are matched with a regex built from the
// English template, and the captured values are put into the translated template.
const exact = new Map();
const templates = [];
for (const row of MESSAGE_ROWS) {
  const [english] = row;
  const names = [...english.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  if (!names.length) {
    exact.set(english, row);
    continue;
  }
  const pattern = escapeRegex(english).replace(/\\?\{(\w+)\\?\}/g, "(.+?)");
  templates.push({ regex: new RegExp(`^${pattern}$`), names, row });
}

const lookup = (message) => {
  const row = exact.get(message);
  if (row) return { row, vars: {} };
  for (const template of templates) {
    const match = template.regex.exec(message);
    if (match) return { row: template.row, vars: Object.fromEntries(template.names.map((name, i) => [name, match[i + 1]])) };
  }
  return null;
};

// Translates an English API message. Unknown server errors (5xx) fall back to a translated generic error
// so internal English error text never reaches a user who chose another language.
export const translateMessage = (message, lang, status = 200) => {
  if (typeof message !== "string" || lang === "en") return message;
  const index = LANGUAGES.indexOf(lang);
  if (index < 0) return message;
  const found = lookup(message);
  if (found) return interpolate(found.row[index] || found.row[0], found.vars);
  if (status >= 500) return interpolate(exact.get(GENERIC_ERROR)[index]);
  if (process.env.NODE_ENV !== "production") console.warn(`[i18n] No ${lang} translation for API message: "${message}"`);
  return message;
};

// True when the message has a translation row with every language filled in (used by scripts/check-i18n.js).
export const hasTranslation = (message) => {
  const found = lookup(message);
  return Boolean(found && LANGUAGES.every((_, i) => found.row[i]?.trim()));
};

export const translateText = (text, lang) => translateMessage(text, normalizeLanguage(lang));

// Email and SMS copy, with English as the fallback for any missing key.
export const emailText = (lang, key, vars) => {
  const code = normalizeLanguage(lang);
  return interpolate(EMAIL_STRINGS[code]?.[key] ?? EMAIL_STRINGS.en[key] ?? key, vars);
};

export const formatDateFor = (lang, value, options) =>
  new Date(value).toLocaleDateString(LOCALE_TAGS[normalizeLanguage(lang)], options);

export const formatDateTimeFor = (lang, value) =>
  new Date(value).toLocaleString(LOCALE_TAGS[normalizeLanguage(lang)], { timeZone: "UTC", timeZoneName: "short" });
