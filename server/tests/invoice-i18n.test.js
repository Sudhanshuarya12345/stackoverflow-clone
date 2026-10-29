// Invoice PDFs are written in the user's language with fonts that cover Latin, Devanagari and Chinese text.
// Run with: npm test
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateInvoicePdfBuffer, splitByScript } from "../utils/invoicePdf.js";
import { LANGUAGES, emailText, planLabel } from "../i18n/index.js";

const payment = {
  invoice_number: "INV-20261029-PAY_TEST",
  invoice_issued_at: new Date("2026-10-29"),
  transaction_id: "pay_TEST",
  plan: "silver",
  amount: 29900,
  currency: "INR",
  payment_method: "upi",
  billing_period_start: new Date("2026-10-29"),
  billing_period_end: new Date("2026-11-29"),
};

describe("invoice PDF localization", () => {
  test("splits mixed-script text into one run per font", () => {
    assert.deepEqual(splitByScript("Bill to: राहुल 王小明"), [
      { script: "latin", text: "Bill to: " },
      { script: "devanagari", text: "राहुल " },
      { script: "cjk", text: "王小明" },
    ]);
    assert.deepEqual(splitByScript("12 राहुल"), [{ script: "devanagari", text: "12 राहुल" }]);
  });

  test("every language has its own invoice wording and plan names", () => {
    for (const lang of LANGUAGES.filter((l) => l !== "en")) {
      assert.notEqual(emailText(lang, "invoice.title"), emailText("en", "invoice.title"), `${lang} invoice title is translated`);
    }
    assert.equal(planLabel("hi", "silver"), "सिल्वर");
    assert.equal(planLabel("zh", "gold"), "黄金");
  });

  test("renders a PDF in every language, including Hindi and Chinese billing names", async () => {
    const names = { hi: "राहुल शर्मा", zh: "王小明" };
    for (const lang of LANGUAGES) {
      const user = { name: names[lang] || "Élodie Peña", email: "user@example.com", language: lang, billingDetails: {} };
      const pdf = await generateInvoicePdfBuffer(payment, user, { name: "SILVER" });
      assert.equal(pdf.subarray(0, 4).toString(), "%PDF", `${lang} invoice is a PDF`);
      assert.ok(pdf.length < 100_000, `${lang} invoice embeds font subsets, not whole fonts`);
    }
  });
});
