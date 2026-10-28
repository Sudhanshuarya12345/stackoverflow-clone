// Localization coverage check for the frontend. Fails (exit 1) when:
//  - a locale is missing a key, has an extra/empty key, or its {placeholders} differ from English
//  - code calls t()/translate() with a key that does not exist in en.ts
//  - a component renders user-facing text that does not go through the translation system
//    (JSX text, user-facing attributes such as placeholder/title/alt/aria-label, toast/alert/confirm text)
// Run with: npm run i18n:check
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "src");
const LANGS = ["en", "es", "hi", "pt", "zh", "fr"];

// Text that is intentionally identical in every language.
const ALLOWED_TEXT = new Set(["stack", "overflow", "Code-Quest", "m@example.com", "m@example.com / +91 98765 43210", "OTP", "Razorpay", "PDF"]);
const USER_FACING_ATTRS = new Set(["placeholder", "title", "alt", "aria-label", "label"]);
const MESSAGE_CALLEES = /^(toast(\.\w+)?|alert|confirm|window\.confirm|window\.alert)$/;
// Primitive UI components only forward children; they contain no copy of their own.
const SKIP_DIRS = [path.join(src, "components", "ui")];

const problems = [];
const report = (file, node, sf, text) => {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  problems.push(`${path.relative(root, file)}:${line + 1}  ${text}`);
};

const parse = (file) =>
  ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

// ---- 1. Dictionaries --------------------------------------------------------------------------------------
const readDictionary = (lang) => {
  const sf = parse(path.join(src, "locales", `${lang}.ts`));
  const dict = {};
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
      const init = node.initializer;
      dict[node.name.text] = ts.isStringLiteralLike(init) ? init.text : null;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return dict;
};
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const dictionaries = Object.fromEntries(LANGS.map((lang) => [lang, readDictionary(lang)]));
const en = dictionaries.en;
const keys = Object.keys(en);
for (const lang of LANGS.slice(1)) {
  const dict = dictionaries[lang];
  for (const key of keys) {
    if (!(key in dict)) problems.push(`locales/${lang}.ts  missing key "${key}"`);
    else if (!dict[key]?.trim()) problems.push(`locales/${lang}.ts  empty translation for "${key}"`);
    else if (placeholders(dict[key]) !== placeholders(en[key])) problems.push(`locales/${lang}.ts  placeholders differ for "${key}"`);
  }
  for (const key of Object.keys(dict)) if (!(key in en)) problems.push(`locales/${lang}.ts  unknown key "${key}"`);
}

// ---- 2 & 3. Source files ----------------------------------------------------------------------------------
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full.startsWith(path.join(src, "locales")) || SKIP_DIRS.includes(full) ? [] : walk(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });

// HTML entities such as &rarr; are symbols, not words.
const hasWords = (text) => /\p{L}{2,}/u.test(text.replace(/&\w+;/g, "")) && !ALLOWED_TEXT.has(text.trim());
let filesChecked = 0;
let keysUsed = 0;

for (const file of walk(src)) {
  filesChecked += 1;
  const sf = parse(file);
  const visit = (node) => {
    // Translation keys must exist (template keys like `plan.${x}` must match at least one key by prefix).
    if (ts.isCallExpression(node) && /^(t|translate)$/.test(node.expression.getText(sf)) && node.arguments[0]) {
      const arg = node.arguments[0];
      keysUsed += 1;
      if (ts.isStringLiteralLike(arg) && !(arg.text in en)) report(file, arg, sf, `unknown translation key "${arg.text}"`);
      if (ts.isTemplateExpression(arg) && !keys.some((k) => k.startsWith(arg.head.text))) {
        report(file, arg, sf, `no translation keys start with "${arg.head.text}"`);
      }
    }
    // Text rendered directly inside JSX.
    if (ts.isJsxText(node) && hasWords(node.text.trim())) report(file, node, sf, `untranslated JSX text "${node.text.trim()}"`);
    // String literal rendered as a JSX child, e.g. {"Save"} or {cond ? "Yes" : "No"}.
    if (ts.isJsxExpression(node) && ts.isJsxElement(node.parent) && node.expression) {
      const literals = [];
      const collect = (n) => {
        if (ts.isStringLiteralLike(n)) literals.push(n);
        else if (ts.isConditionalExpression(n)) [n.whenTrue, n.whenFalse].forEach(collect);
        else if (ts.isBinaryExpression(n) && /\|\||\?\?|&&/.test(n.operatorToken.getText(sf))) collect(n.right);
        else if (ts.isParenthesizedExpression(n)) collect(n.expression);
      };
      collect(node.expression);
      for (const lit of literals) if (hasWords(lit.text)) report(file, lit, sf, `untranslated JSX string "${lit.text}"`);
    }
    // User-facing attributes.
    if (ts.isJsxAttribute(node) && USER_FACING_ATTRS.has(node.name.getText(sf)) && node.initializer) {
      const init = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      if (init && ts.isStringLiteralLike(init) && hasWords(init.text)) {
        report(file, init, sf, `untranslated ${node.name.getText(sf)}="${init.text}"`);
      }
    }
    // toast("..."), alert("..."), confirm("...").
    if (ts.isCallExpression(node) && MESSAGE_CALLEES.test(node.expression.getText(sf))) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg) && hasWords(arg.text)) report(file, arg, sf, `untranslated message "${arg.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (problems.length) {
  console.error(`✗ ${problems.length} localization problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `✓ Localization coverage OK: ${keys.length} keys × ${LANGS.length} languages, ${keysUsed} translation calls in ${filesChecked} files, no hardcoded UI text.`
);
