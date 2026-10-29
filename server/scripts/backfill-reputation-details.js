// Adds the translation key (detailKey/detailVars) to reputation-history entries written before entries carried
// one, by matching their English `reason` against the fixed sentences the server used to write.
// Dry run (counts only):  node scripts/backfill-reputation-details.js
// Write the keys:         node scripts/backfill-reputation-details.js --apply
// Only fills entries that have no detailKey yet, so it is safe to run more than once.
import dotenv from "dotenv";
import mongoose from "mongoose";
import ReputationLog from "../models/ReputationLog.js";

dotenv.config();
const apply = process.argv.includes("--apply");

// [type, pattern, key, (match, log) => vars]
const RULES = [
  ["answer_posted", /^Posted an answer on "(.*)"$/s, "answerPosted", (m) => ({ title: m[1] })],
  ["accept_revoked", /^Accepted answer on "(.*)" was deleted$/s, "acceptedAnswerDeleted", (m) => ({ title: m[1] })],
  ["accept_revoked", /^Answer on "(.*)" is no longer accepted$/s, "acceptRevoked", (m) => ({ title: m[1] })],
  ["answer_deleted", /^Deleted your answer on "(.*)"$/s, "answerDeleted", (m) => ({ title: m[1] })],
  ["answer_accepted", /^Answer accepted on "(.*)"$/s, "answerAccepted", (m) => ({ title: m[1] })],
  ["bounty_started", /^Offered a bounty on "(.*)"$/s, "bountyStarted", (m) => ({ title: m[1] })],
  ["bounty_awarded", /^Won a \+(\d+) bounty on "(.*)"$/s, "bountyAwarded", (m) => ({ amount: Number(m[1]), title: m[2] })],
  ["bounty_refunded", /^Bounty expired without an award on "(.*)"$/s, "bountyExpired", (m) => ({ title: m[1] })],
  ["bounty_refunded", /^Bounty returned because the question was deleted on "(.*)"$/s, "bountyQuestionDeleted", (m) => ({ title: m[1] })],
  ["downvote_received", /^Your question received a downvote$/, "downvoteQuestion", () => undefined],
  ["downvote_received", /^Your answer received a downvote$/, "downvoteAnswer", () => undefined],
  ["downvote_retracted", /^A downvote on your question was removed$/, "downvoteRemovedQuestion", () => undefined],
  ["downvote_retracted", /^A downvote on your answer was removed$/, "downvoteRemovedAnswer", () => undefined],
  ["question_upvote_milestone", /^Your question "(.*)" reached (\d+) upvotes$/s, "questionMilestone", (m) => ({ title: m[1], votes: Number(m[2]) })],
  ["answer_upvote_milestone", /^Your answer on "(.*)" reached (\d+) upvotes$/s, "answerMilestone", (m) => ({ title: m[1], votes: Number(m[2]) })],
  ["profile_completed", /^Completed all mandatory profile details$/, "profileCompleted", () => undefined],
  ["content_removed", /^Question "(.*)" removed by an administrator$/s, "questionRemoved", (m) => ({ title: m[1] })],
  ["content_removed", /^Answer on "(.*)" removed by an administrator$/s, "answerRemoved", (m) => ({ title: m[1] })],
  ["content_removed", /^Community post removed by an administrator/, "postRemoved", () => undefined],
  ["transfer_received", /^Received from a community member: /, "transferReceived", () => undefined],
  // "Sent to <name>: <note>" - the note is stored separately, so the name is whatever precedes it.
  [
    "transfer_sent",
    /^Sent to (.*)$/s,
    "transferSent",
    (m, log) => {
      const suffix = log.note ? `: ${log.note}` : null;
      if (suffix && m[1].endsWith(suffix)) return { name: m[1].slice(0, -suffix.length) };
      const colon = m[1].indexOf(": ");
      return colon > 0 ? { name: m[1].slice(0, colon) } : null;
    },
  ],
];

await mongoose.connect(process.env.MONGODB_URL);
try {
  const cursor = ReputationLog.find({ detailKey: { $exists: false } }).select("type reason note").lean().cursor();
  const counts = {};
  const unmatched = {};
  const writes = [];
  for await (const log of cursor) {
    let done = false;
    for (const [type, pattern, key, toVars] of RULES) {
      if (log.type !== type) continue;
      const match = String(log.reason || "").match(pattern);
      if (!match) continue;
      const vars = toVars(match, log);
      if (vars === null) continue;
      writes.push({
        updateOne: {
          filter: { _id: log._id, detailKey: { $exists: false } },
          update: { $set: { detailKey: key, ...(vars ? { detailVars: vars } : {}) } },
        },
      });
      counts[key] = (counts[key] || 0) + 1;
      done = true;
      break;
    }
    if (!done) unmatched[log.type] = (unmatched[log.type] || 0) + 1;
  }

  console.log(`${writes.length} entr${writes.length === 1 ? "y" : "ies"} can be given a translation key:`, counts);
  if (Object.keys(unmatched).length) console.log("Left as is (no known sentence matched):", unmatched);
  if (apply && writes.length) {
    for (let i = 0; i < writes.length; i += 500) await ReputationLog.bulkWrite(writes.slice(i, i + 500), { ordered: false });
    console.log("✓ Keys written.");
  } else if (writes.length) {
    console.log("Dry run only. Run again with --apply to write the keys.");
  }
} finally {
  await mongoose.disconnect();
}
