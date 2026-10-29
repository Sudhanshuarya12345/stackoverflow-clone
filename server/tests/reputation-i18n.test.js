// Every reputation-history key the server records must have wording in all six frontend locales, otherwise the
// history would show a raw key. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locales = path.join(server, "..", "stack", "src", "locales");
const sources = ["controller", "services"].flatMap((dir) =>
  fs.readdirSync(path.join(server, dir)).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(server, dir, f), "utf8"))
);

test("reputation history keys recorded by the server exist in every frontend locale", { skip: !fs.existsSync(locales) }, () => {
  const keys = new Set();
  for (const text of sources) {
    for (const match of text.matchAll(/\b(?:detail: \{\s*key|detailKey):\s*([^,}]+)/g)) {
      // Skip comparison operands such as `what === "question"`; only the chosen keys count.
      for (const literal of match[1].matchAll(/(?<!=== )"([A-Za-z]+)"/g)) keys.add(literal[1]);
    }
    // refundBounty(...) receives its key as an argument.
    for (const literal of text.matchAll(/refundBounty\([^)]*?"(bounty[A-Za-z]+)"/g)) keys.add(literal[1]);
  }
  assert.ok(keys.size >= 21, `found ${keys.size} keys: ${[...keys].join(", ")}`);
  for (const lang of ["en", "es", "hi", "pt", "zh", "fr"]) {
    const dict = fs.readFileSync(path.join(locales, `${lang}.ts`), "utf8");
    for (const key of keys) assert.ok(dict.includes(`"repDetail.${key}":`), `${lang}.ts is missing repDetail.${key}`);
  }
});
