// Integration tests for the all-or-nothing guarantees of subscription activation and reputation transfers.
// Runs against a throwaway in-memory MongoDB replica set (transactions need one), never the real database.
// Run with: npm test
import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";

// Set before the app modules load (config/plans.js runs dotenv, which never overrides existing variables):
// no email API keys, and an SMTP server that refuses connections, so every email attempt fails fast.
Object.assign(process.env, { BREVO_API_KEY: "", RESEND_API_KEY: "", SMTP_HOST: "127.0.0.1", SMTP_PORT: "9", MONGODB_URL: "" });

const { default: User } = await import("../models/auth.js");
const { default: Subscription } = await import("../models/Subscription.js");
const { default: Payment } = await import("../models/Payment.js");
const { default: ReputationLog } = await import("../models/ReputationLog.js");
const { default: ReputationTransfer } = await import("../models/ReputationTransfer.js");
const { recordSubscriptionPayment, invoiceEmailStatus } = await import("../services/subscriptionBilling.js");
const { transferReputation } = await import("../controller/reputation.js");

let replSet;
before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replSet.getUri());
  await Promise.all([User, Subscription, Payment, ReputationLog, ReputationTransfer].map((m) => m.createCollection().then(() => m.syncIndexes())));
});
after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});
beforeEach(async () => {
  await Promise.all([User, Subscription, Payment, ReputationLog, ReputationTransfer].map((m) => m.deleteMany({})));
});

const makeUser = (name, extra = {}) => User.create({ name, email: `${name}@test.dev`, password: "x", ...extra });

const callTransfer = async (userid, body) => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  await transferReputation({ userid: String(userid), body }, res);
  return res;
};

describe("subscription activation", () => {
  const payment = { id: "pay_TEST1", amount: 9900, currency: "INR", method: "card" };

  test("activates, upgrades the plan and issues the invoice together; queues the email when mail is down", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });

    const result = await recordSubscriptionPayment(sub, payment);

    assert.equal(result.created, true);
    assert.equal((await Subscription.findById(sub._id)).status, "active");
    assert.equal((await User.findById(user._id)).plan, "bronze");
    const stored = await Payment.findOne({ razorpay_payment_id: payment.id }).select("+invoice_pdf");
    assert.match(stored.invoice_number, /^INV-\d{8}-PAY_TEST1$/);
    assert.equal(stored.invoice_pdf.subarray(0, 4).toString(), "%PDF", "invoice PDF is stored with the payment");
    // The email failed, so it stays queued with a scheduled retry instead of being lost.
    assert.equal(invoiceEmailStatus(stored), "pending");
    assert.equal(stored.invoice_email_attempts, 1);
    assert.ok(stored.invoice_email_next_attempt_at > new Date());
  });

  test("rolls back activation and the plan upgrade when the invoice cannot be issued", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });
    const originalSave = Payment.prototype.save;
    Payment.prototype.save = async function () {
      throw new Error("simulated invoice failure");
    };
    try {
      await assert.rejects(recordSubscriptionPayment(sub, payment), /simulated invoice failure/);
    } finally {
      Payment.prototype.save = originalSave;
    }

    assert.equal((await Subscription.findById(sub._id)).status, "created");
    assert.equal((await User.findById(user._id)).plan, "free");
    assert.equal(await Payment.countDocuments(), 0);
  });

  test("records a payment only once when the webhook and reconcile both deliver it", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });

    const results = await Promise.all([recordSubscriptionPayment(sub, payment), recordSubscriptionPayment(sub, payment)]);

    assert.equal(results.filter((r) => r.created).length, 1);
    assert.equal(await Payment.countDocuments({ razorpay_payment_id: payment.id }), 1);
  });

  test("rejects a payment whose amount does not match the plan without activating anything", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "gold", razorpay_subscription_id: "sub_1" });

    await assert.rejects(recordSubscriptionPayment(sub, payment), { code: "PLAN_MISMATCH" });
    assert.equal((await Subscription.findById(sub._id)).status, "created");
    assert.equal(await Payment.countDocuments(), 0);
  });
});

describe("reputation transfer", () => {
  test("moves points and writes the transfer record and both history entries", async () => {
    const sender = await makeUser("sender", { reputation: 100 });
    const receiver = await makeUser("receiver", { reputation: 10 });

    const res = await callTransfer(sender._id, { receiverId: String(receiver._id), amount: 30, reason: "great answer" });

    assert.equal(res.statusCode, 201);
    assert.equal((await User.findById(sender._id)).reputation, 70);
    assert.equal((await User.findById(receiver._id)).reputation, 40);
    const transfer = await ReputationTransfer.findOne();
    assert.equal(transfer.senderBalanceAfter, 70);
    assert.equal(transfer.receiverBalanceAfter, 40);
    const logs = await ReputationLog.find({ transferId: transfer._id }).sort({ delta: 1 });
    assert.deepEqual(logs.map((l) => [String(l.user), l.delta]), [[String(sender._id), -30], [String(receiver._id), 30]]);
  });

  test("leaves every record untouched when a step fails part-way through", async () => {
    const sender = await makeUser("sender", { reputation: 100 });
    const receiver = await makeUser("receiver", { reputation: 10 });
    // Fail on the last write (the sender's history entry), after the debit, credit and transfer record.
    const originalCreate = ReputationLog.create;
    ReputationLog.create = async function (docs, ...rest) {
      if (docs?.[0]?.type === "transfer_sent") throw new Error("simulated failure");
      return originalCreate.call(this, docs, ...rest);
    };
    let res;
    try {
      res = await callTransfer(sender._id, { receiverId: String(receiver._id), amount: 30, reason: "great answer" });
    } finally {
      ReputationLog.create = originalCreate;
    }

    assert.equal(res.statusCode, 500);
    const senderAfter = await User.findById(sender._id);
    assert.equal(senderAfter.reputation, 100);
    assert.ok(!senderAfter.repTransferredToday, "daily allowance is not consumed");
    assert.equal((await User.findById(receiver._id)).reputation, 10);
    assert.equal(await ReputationTransfer.countDocuments(), 0);
    assert.equal(await ReputationLog.countDocuments(), 0);
  });

  test("concurrent transfers cannot exceed the daily limit", async () => {
    const sender = await makeUser("sender", { reputation: 1000 });
    const receiver = await makeUser("receiver");

    // Three transfers of 50 against a 100-per-day limit: exactly two may succeed.
    const results = await Promise.all(
      [1, 2, 3].map(() => callTransfer(sender._id, { receiverId: String(receiver._id), amount: 50, reason: "thanks a lot" }))
    );

    assert.equal(results.filter((r) => r.statusCode === 201).length, 2);
    assert.equal((await User.findById(sender._id)).reputation, 900);
    assert.equal((await User.findById(receiver._id)).reputation, 200);
    assert.equal(await ReputationTransfer.countDocuments(), 2);
    assert.equal(await ReputationLog.countDocuments(), 4);
  });
});
