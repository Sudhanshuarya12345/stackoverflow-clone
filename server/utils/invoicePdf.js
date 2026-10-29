import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { LOCALE_TAGS, emailText, formatDateFor, normalizeLanguage, planLabel } from "../i18n/index.js";

// PDFKit's built-in Helvetica only covers Western European text, so the invoice embeds Noto fonts (SIL Open Font
// License, see assets/fonts) for Latin, Devanagari (Hindi) and Simplified Chinese.
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");
const FONT_FILES = {
  latin: "NotoSans-Regular.ttf",
  "latin-bold": "NotoSans-Bold.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  "devanagari-bold": "NotoSansDevanagari-Bold.ttf",
  cjk: "NotoSansSC-Regular.ttf",
  "cjk-bold": "NotoSansSC-Regular.ttf", // no bold weight bundled; the CJK font is large
};
const fontCache = new Map();
const fontBuffer = (file) => {
  if (!fontCache.has(file)) fontCache.set(file, fs.readFileSync(path.join(FONT_DIR, file)));
  return fontCache.get(file);
};

const scriptOf = (char) => {
  const code = char.codePointAt(0);
  if ((code >= 0x0900 && code <= 0x097f) || (code >= 0xa8e0 && code <= 0xa8ff)) return "devanagari";
  if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef)) return "cjk";
  // Spaces, digits and ASCII punctuation exist in every bundled font, so they stay with the surrounding text.
  if (/[\s\d!-/:-@[-`{-~]/.test(char)) return null;
  return "latin";
};

// Splits text into runs that each use one font, e.g. "Bill to: राहुल" -> [latin "Bill to: ", devanagari "राहुल"].
export const splitByScript = (text) => {
  const runs = [];
  for (const char of String(text ?? "")) {
    const script = scriptOf(char);
    const last = runs[runs.length - 1];
    if (last && (script === null || script === last.script)) last.text += char;
    else if (!last && script === null) runs.push({ script: null, text: char });
    else if (last && last.script === null) Object.assign(last, { script, text: last.text + char });
    else runs.push({ script, text: char });
  }
  return runs.map((run) => ({ ...run, script: run.script || "latin" }));
};

// Writes one line of mixed-script text. Single-font text goes through PDFKit's layout (so long addresses wrap);
// mixed text is positioned run by run, which keeps right alignment correct across font changes.
const writeLine = (doc, text, { x = doc.page.margins.left, y = doc.y, width, align = "left", bold = false, size } = {}) => {
  if (size) doc.fontSize(size);
  const runs = splitByScript(text);
  const fontFor = (script) => (bold ? `${script}-bold` : script);
  const lineWidth = width ?? doc.page.width - doc.page.margins.right - x;
  if (runs.length <= 1) {
    doc.font(fontFor(runs[0]?.script || "latin")).text(runs[0]?.text || "", x, y, { width: lineWidth, align });
    return;
  }
  const total = runs.reduce((sum, run) => sum + doc.font(fontFor(run.script)).widthOfString(run.text), 0);
  let cursor = align === "right" ? x + lineWidth - total : align === "center" ? x + (lineWidth - total) / 2 : x;
  // Fonts have different ascenders, so every run is placed on one shared baseline instead of a shared top edge.
  const baseline = y + Math.max(...runs.map((run) => (doc.font(fontFor(run.script))._font.ascender / 1000) * doc._fontSize));
  let lineHeight = 0;
  for (const run of runs) {
    doc.font(fontFor(run.script));
    doc.text(run.text, cursor, baseline, { lineBreak: false, baseline: "alphabetic" });
    cursor += doc.widthOfString(run.text);
    lineHeight = Math.max(lineHeight, doc.currentLineHeight(true));
  }
  doc.x = x;
  doc.y = y + lineHeight;
};

const money = (lang, amountPaise, currency = "INR") => {
  const value = (amountPaise || 0) / 100;
  try {
    return new Intl.NumberFormat(LOCALE_TAGS[lang], { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

// Returns a promise that resolves with a Buffer containing the PDF, written in `lang` (default: the user's language).
export const generateInvoicePdfBuffer = (paymentDoc, userDoc, planDetails, { lang } = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const code = normalizeLanguage(lang ?? userDoc?.language);
      const t = (key, vars) => emailText(code, key, vars);
      const date = (value) => (value ? formatDateFor(code, value, { dateStyle: "long" }) : t("invoice.notAvailable"));
      const currency = paymentDoc.currency || "INR";

      const doc = new PDFDocument({ margin: 50, lang: LOCALE_TAGS[code] });
      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);
      for (const [name, file] of Object.entries(FONT_FILES)) doc.registerFont(name, fontBuffer(file));

      const left = 50;
      const right = 500;

      // Header
      writeLine(doc, t("invoice.title"), { x: left, width: right - left, align: "right", bold: true, size: 20 });
      doc.fontSize(10);
      writeLine(doc, t("invoice.number", { number: paymentDoc.invoice_number }), { x: left, width: right - left, align: "right" });
      writeLine(doc, t("invoice.date", { date: date(paymentDoc.invoice_issued_at || paymentDoc.createdAt || Date.now()) }), {
        x: left,
        width: right - left,
        align: "right",
      });
      writeLine(doc, t("invoice.transaction", { id: paymentDoc.transaction_id || paymentDoc.razorpay_payment_id }), {
        x: left,
        width: right - left,
        align: "right",
      });
      doc.moveDown();

      // Bill To
      writeLine(doc, t("invoice.billTo"), { x: left, bold: true, size: 14 });
      const billing = userDoc?.billingDetails || {};
      doc.fontSize(12);
      writeLine(doc, billing.billingName || userDoc?.name, { x: left });
      writeLine(doc, billing.billingEmail || userDoc?.email, { x: left });
      if (billing.addressLine1) {
        writeLine(doc, billing.addressLine1, { x: left });
        if (billing.addressLine2) writeLine(doc, billing.addressLine2, { x: left });
        const cityLine = [billing.city, billing.state, billing.postalCode].filter(Boolean).join(", ");
        if (cityLine) writeLine(doc, cityLine, { x: left });
        if (billing.country) writeLine(doc, billing.country, { x: left });
      }
      if (billing.gstNumber) writeLine(doc, `GSTIN: ${billing.gstNumber}`, { x: left });
      doc.moveDown(2);

      // Plan Details Table
      const tableTop = doc.y;
      writeLine(doc, t("invoice.description"), { x: left, y: tableTop, width: 300, bold: true, size: 12 });
      writeLine(doc, t("invoice.amount"), { x: 350, y: tableTop, width: right - 350, align: "right", bold: true, size: 12 });

      const hrY = doc.y + 5;
      doc.moveTo(left, hrY).lineTo(right, hrY).stroke();

      const rowTop = hrY + 10;
      writeLine(doc, t("invoice.item", { plan: paymentDoc.plan ? planLabel(code, paymentDoc.plan) : planDetails.name }), { x: left, y: rowTop, width: 300 });
      writeLine(doc, money(code, paymentDoc.amount, currency), { x: 350, y: rowTop, width: right - 350, align: "right" });

      doc.moveDown(3);
      doc.fontSize(11);
      writeLine(doc, t("invoice.period", { start: date(paymentDoc.billing_period_start), end: date(paymentDoc.billing_period_end) }), { x: left });
      writeLine(doc, t("invoice.method", { method: paymentDoc.payment_method || "Razorpay" }), { x: left });
      writeLine(doc, t("invoice.tax", { amount: money(code, paymentDoc.tax_amount || 0, currency) }), { x: left });
      writeLine(doc, t("invoice.total", { amount: money(code, paymentDoc.amount, currency) }), { x: left, bold: true });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
