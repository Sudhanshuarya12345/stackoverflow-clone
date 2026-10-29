// Integration tests: every reputation change commits together with the action that causes it, or not at all.
// Each "rolls back" test injects a failure on the LAST write of the operation and checks nothing was left behind.
// Runs against a throwaway in-memory MongoDB replica set. Run with: npm test
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

Object.assign(process.env, { BREVO_API_KEY: "", RESEND_API_KEY: "", SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", MONGODB_URL: "" });

const { default: User } = await import("../models/auth.js");
const { default: Question } = await import("../models/question.js");
const { default: CommunityPost } = await import("../models/CommunityPost.js");
const { default: Report } = await import("../models/Report.js");
const { default: Session } = await import("../models/Session.js");
const { default: ReputationLog } = await import("../models/ReputationLog.js");
const questionCtrl = await import("../controller/question.js");
const answerCtrl = await import("../controller/answer.js");
const { deletePost } = await import("../controller/communityPost.js");
const { reviewReport } = await import("../controller/communityModeration.js");
const { awardProfileCompletionBonus } = await import("../services/reputationService.js");

const models = [User, Question, CommunityPost, Report, Session, ReputationLog];
let replSet;
before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
  await Promise.all(models.map((m) => m.createCollection().then(() => m.syncIndexes())));
});
after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
beforeEach(async () => {
  await Promise.all(models.map((m) => m.deleteMany({})));
});

const makeUser = (name, extra = {}) => User.create({ name, email: `${name}@test.dev`, password: "x", ...extra });
const rep = async (user) => (await User.findById(user._id)).reputation;
const call = async (handler, userid, { params = {}, body = {} } = {}) => {
  const res = { statusCode: 200 };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  await handler({ userid: String(userid), params, body, query: {} }, res);
  return res;
};
// Makes ReputationLog.create fail for entries of `type`, simulating a crash part-way through an operation.
const failLogOfType = async (type, fn) => {
  const original = ReputationLog.create;
  ReputationLog.create = async function (docs, ...rest) {
    if ([].concat(docs).some((d) => d?.type === type)) throw new Error(`simulated failure writing ${type}`);
    return original.call(this, docs, ...rest);
  };
  try {
    return await fn();
  } finally {
    ReputationLog.create = original;
  }
};
const makeQuestion = (owner, extra = {}) =>
  Question.create({ questiontitle: "Q", questionbody: "B", questiontags: ["t"], userid: String(owner._id), userposted: owner.name, ...extra });
const withAnswer = async (q, author, extra = {}) => {
  q.answer.push({ answerbody: "A", useranswered: author.name, userid: String(author._id), ...extra });
  q.noofanswer = q.answer.length;
  await q.save();
  return q.answer[q.answer.length - 1];
};

describe("bounties", () => {
  test("starting a bounty debits the starter and records it", async () => {
    const owner = await makeUser("owner", { reputation: 300 });
    const q = await makeQuestion(owner);
    const res = await call(questionCtrl.startBounty, owner._id, { params: { id: String(q._id) }, body: { amount: 100 } });
    assert.equal(res.statusCode, 200);
    assert.equal(await rep(owner), 200);
    assert.equal((await Question.findById(q._id)).bounty.status, "active");
    assert.equal(await ReputationLog.countDocuments({ type: "bounty_started" }), 1);
  });

  test("starting a bounty rolls back the debit when a step fails", async () => {
    const owner = await makeUser("owner", { reputation: 300 });
    const q = await makeQuestion(owner);
    const res = await failLogOfType("bounty_started", () =>
      call(questionCtrl.startBounty, owner._id, { params: { id: String(q._id) }, body: { amount: 100 } })
    );
    assert.equal(res.statusCode, 500);
    assert.equal(await rep(owner), 300);
    assert.notEqual((await Question.findById(q._id)).bounty?.status, "active");
  });

  test("awarding a bounty rolls back the claim, acceptance and payout together", async () => {
    const owner = await makeUser("owner", { reputation: 300 });
    const helper = await makeUser("helper", { reputation: 10 });
    const q = await makeQuestion(owner, { bounty: { amount: 100, status: "active", startedBy: owner._id, startedAt: new Date(), expiresAt: new Date(Date.now() + 1e8) } });
    const ans = await withAnswer(q, helper);
    const params = { id: String(q._id), answerId: String(ans._id) };

    const failed = await failLogOfType("bounty_awarded", () => call(questionCtrl.awardBounty, owner._id, { params }));
    assert.equal(failed.statusCode, 500);
    let fresh = await Question.findById(q._id);
    assert.equal(fresh.bounty.status, "active", "bounty is still awardable");
    assert.equal(fresh.answer.id(ans._id).isAccepted, false, "acceptance rolled back");
    assert.equal(await rep(helper), 10, "no +10 acceptance and no bounty paid");

    const ok = await call(questionCtrl.awardBounty, owner._id, { params });
    assert.equal(ok.statusCode, 200);
    fresh = await Question.findById(q._id);
    assert.equal(fresh.bounty.status, "awarded");
    assert.equal(await rep(helper), 10 + 10 + 100);
  });

  test("an expired bounty is refunded exactly once", async () => {
    const owner = await makeUser("owner", { reputation: 0 });
    await makeQuestion(owner, { bounty: { amount: 50, status: "active", startedBy: owner._id, startedAt: new Date(), expiresAt: new Date(Date.now() - 1000) } });
    await Promise.all([questionCtrl.expireOldBounties(), questionCtrl.expireOldBounties()]);
    assert.equal(await rep(owner), 50);
  });

  test("deleting a question refunds its bounty in the same transaction", async () => {
    const owner = await makeUser("owner", { reputation: 0 });
    const q = await makeQuestion(owner, { bounty: { amount: 50, status: "active", startedBy: owner._id, startedAt: new Date(), expiresAt: new Date(Date.now() + 1e8) } });
    const failed = await failLogOfType("bounty_refunded", () => call(questionCtrl.deletequestion, owner._id, { params: { id: String(q._id) } }));
    assert.equal(failed.statusCode, 500);
    assert.ok(await Question.exists({ _id: q._id }), "question not deleted when the refund fails");
    assert.equal(await rep(owner), 0);

    const ok = await call(questionCtrl.deletequestion, owner._id, { params: { id: String(q._id) } });
    assert.equal(ok.statusCode, 200);
    assert.equal(await Question.exists({ _id: q._id }), null);
    assert.equal(await rep(owner), 50);
  });
});

describe("accepted answers", () => {
  test("switching the accepted answer moves the +10 atomically", async () => {
    const owner = await makeUser("owner");
    const a = await makeUser("alice", { reputation: 0 });
    const b = await makeUser("bob", { reputation: 0 });
    const q = await makeQuestion(owner);
    const first = await withAnswer(q, a);
    const second = await withAnswer(q, b);
    await call(questionCtrl.acceptAnswer, owner._id, { params: { id: String(q._id), answerId: String(first._id) } });
    assert.equal(await rep(a), 10);

    // Fail on the +10 for the new answer, after the -10 for the old one was written.
    const failed = await failLogOfType("answer_accepted", () =>
      call(questionCtrl.acceptAnswer, owner._id, { params: { id: String(q._id), answerId: String(second._id) } })
    );
    assert.equal(failed.statusCode, 500);
    assert.equal(await rep(a), 10, "old answer keeps its +10");
    assert.equal(await rep(b), 0);
    const fresh = await Question.findById(q._id);
    assert.equal(fresh.answer.id(first._id).isAccepted, true, "acceptance unchanged");

    const ok = await call(questionCtrl.acceptAnswer, owner._id, { params: { id: String(q._id), answerId: String(second._id) } });
    assert.equal(ok.statusCode, 200);
    assert.equal(await rep(a), 0);
    assert.equal(await rep(b), 10);
  });
});

describe("answers", () => {
  test("posting an answer is rolled back if its +5 cannot be recorded", async () => {
    const owner = await makeUser("owner");
    const author = await makeUser("author", { reputation: 0 });
    const q = await makeQuestion(owner);
    const res = await failLogOfType("answer_posted", () =>
      call(answerCtrl.Askanswer, author._id, { params: { id: String(q._id) }, body: { answerbody: "hello" } })
    );
    assert.equal(res.statusCode, 500);
    const fresh = await Question.findById(q._id);
    assert.equal(fresh.answer.length, 0);
    assert.equal(await rep(author), 0);
  });

  test("deleting an accepted answer is rolled back if a reputation change fails", async () => {
    const owner = await makeUser("owner");
    const author = await makeUser("author", { reputation: 20 });
    const q = await makeQuestion(owner);
    const ans = await withAnswer(q, author, { isAccepted: true });
    const res = await failLogOfType("answer_deleted", () =>
      call(answerCtrl.deleteanswer, author._id, { params: { id: String(q._id) }, body: { answerid: String(ans._id) } })
    );
    assert.equal(res.statusCode, 500);
    assert.equal((await Question.findById(q._id)).answer.length, 1, "answer still there");
    assert.equal(await rep(author), 20, "the -10 accept revocation was rolled back too");
  });
});

describe("votes", () => {
  test("a downvote is rolled back if its reputation penalty fails", async () => {
    const owner = await makeUser("owner", { reputation: 50 });
    const voter = await makeUser("voter");
    const q = await makeQuestion(owner);
    const res = await failLogOfType("downvote_received", () =>
      call(questionCtrl.votequestion, voter._id, { params: { id: String(q._id) }, body: { value: "downvote" } })
    );
    assert.equal(res.statusCode, 500);
    assert.deepEqual((await Question.findById(q._id)).downvote, []);
    assert.equal(await rep(owner), 50);

    const ok = await call(questionCtrl.votequestion, voter._id, { params: { id: String(q._id) }, body: { value: "downvote" } });
    assert.equal(ok.statusCode, 200);
    assert.equal(await rep(owner), 48);
  });
});

describe("moderation", () => {
  test("profile bonus flag and +10 commit together", async () => {
    const user = await makeUser("p", { reputation: 0, phone: "+911234567890", about: "hi", tags: ["js"] });
    await assert.rejects(failLogOfType("profile_completed", () => awardProfileCompletionBonus(user)));
    assert.equal((await User.findById(user._id)).profileBonusAwarded, false, "bonus not marked as paid");
    assert.equal(await awardProfileCompletionBonus(await User.findById(user._id)), true);
    assert.equal(await rep(user), 10);
  });

  test("removing a reported post: report, removal, penalty and suspension commit together, once", async () => {
    const admin = await makeUser("admin", { role: "admin" });
    const author = await makeUser("author", { reputation: 100, removedContentCount: 2 });
    const reporter = await makeUser("reporter");
    const post = await CommunityPost.create({ author: author._id, content: "spam" });
    const report = await Report.create({ postId: post._id, reporterId: reporter._id, reason: "spam" });
    await Session.create({ user: author._id, tokenId: "t1", expiresAt: new Date(Date.now() + 1e8) }).catch(() => {});

    const failed = await failLogOfType("content_removed", () => call(reviewReport, admin._id, { params: { id: String(report._id) }, body: { action: "remove" } }));
    assert.equal(failed.statusCode, 500);
    assert.equal((await Report.findById(report._id)).status, "pending");
    assert.equal((await CommunityPost.findById(post._id)).status, "active");
    assert.equal(await rep(author), 100);

    const [r1, r2] = await Promise.all([
      call(reviewReport, admin._id, { params: { id: String(report._id) }, body: { action: "remove" } }),
      call(reviewReport, admin._id, { params: { id: String(report._id) }, body: { action: "remove" } }),
    ]);
    assert.deepEqual([r1.statusCode, r2.statusCode].sort(), [200, 400], "only one admin review goes through");
    const after = await User.findById(author._id);
    assert.equal(after.reputation, 90, "penalised exactly once");
    assert.equal(after.removedContentCount, 3);
    assert.equal(after.suspended, true, "auto-suspended at the third removal");
  });

  test("an admin deleting a post: deletion and penalty commit together", async () => {
    const admin = await makeUser("admin", { role: "admin" });
    const author = await makeUser("author", { reputation: 100 });
    const post = await CommunityPost.create({ author: author._id, content: "bad" });
    const failed = await failLogOfType("content_removed", () => call(deletePost, admin._id, { params: { id: String(post._id) } }));
    assert.equal(failed.statusCode, 500);
    assert.ok(await CommunityPost.exists({ _id: post._id }), "post kept when the penalty fails");
    const ok = await call(deletePost, admin._id, { params: { id: String(post._id) } });
    assert.equal(ok.statusCode, 200);
    assert.equal(await CommunityPost.exists({ _id: post._id }), null);
    assert.equal(await rep(author), 90);
  });
});
