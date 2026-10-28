// Localization coverage check for the API. Every user-facing message the server can send back must have a
// row in i18n/messages.js translated into all six languages, and every email/SMS key must exist in every
// language. Exits with code 1 and lists the gaps otherwise.
// Run with: npm run i18n:check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasTranslation, LANGUAGES } from "../i18n/index.js";
import { EMAIL_STRINGS } from "../i18n/emails.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["controller", "middleware", "routes", "services", "config", "utils"];
const EXTRA_FILES = ["index.js"];

const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : e.name.endsWith(".js") ? [full] : [];
      })
    : [];

// Patterns whose string literal reaches the user as an API `message` (directly, or via a 4xx error that a
// controller forwards with `message: error.message`), or as stored text shown in the UI.
const SOURCES = [
  /\bmessage:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
  /Object\.assign\(\s*new Error\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\),\s*\{\s*status:/g,
  /\bsuspendedReason:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
];

// Turns a source literal into a sample runtime message: `Limit is ${max}` -> "Limit is 7".
const sampleFrom = (literal) => {
  const body = literal.slice(1, -1);
  if (literal[0] !== "`") return body.replace(/\\(.)/g, "$1");
  return body.replace(/\$\{[^}]*\}/g, "7");
};

const problems = [];
let checked = 0;
const files = [...SCAN_DIRS.flatMap((d) => walk(path.join(root, d))), ...EXTRA_FILES.map((f) => path.join(root, f))];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of SOURCES) {
    for (const match of text.matchAll(pattern)) {
      const message = sampleFrom(match[1]);
      if (!/\p{L}{2,}/u.test(message)) continue;
      checked += 1;
      if (!hasTranslation(message)) {
        const line = text.slice(0, match.index).split("\n").length;
        problems.push(`${path.relative(root, file)}:${line}  no translation for "${match[1].slice(1, -1)}"`);
      }
    }
  }
}

const emailKeys = Object.keys(EMAIL_STRINGS.en);
for (const lang of LANGUAGES) {
  for (const key of emailKeys) {
    if (!EMAIL_STRINGS[lang]?.[key]?.trim()) problems.push(`i18n/emails.js  "${lang}" is missing email/SMS text "${key}"`);
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} localization problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`✓ API localization coverage OK: ${checked} messages and ${emailKeys.length} email/SMS strings translated into ${LANGUAGES.length} languages.`);
