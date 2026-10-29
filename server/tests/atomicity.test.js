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
const { reconcileMySubscription, razorpayClient } = await import("../controller/subscription.js");
const { endSubscription, expireDueSubscriptions, refreshUserPlanFromSubscription } = await import("../services/subscriptionAccess.js");

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

const callReconcile = async (userid) => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (data) => ((res.body = data), res);
  await reconcileMySubscription({ userid: String(userid) }, res);
  return res;
};

const DAY = 24 * 60 * 60 * 1000;
const unix = (date) => Math.floor(date.getTime() / 1000);

// Razorpay reports the subscription as active and charged; `syncFails` simulates the payment sync breaking.
const fakeRazorpay = ({ status = "active", syncFails = false } = {}) => {
  const start = new Date();
  const end = new Date(Date.now() + 30 * DAY);
  return {
    subscriptions: { fetch: async () => ({ status, current_start: unix(start), current_end: unix(end) }) },
    invoices: {
      all: async () => {
        if (syncFails) throw new Error("simulated Razorpay outage");
        return { items: [{ status: "paid", payment_id: "pay_R1", billing_start: unix(start), billing_end: unix(end) }] };
      },
    },
    payments: { fetch: async () => ({ id: "pay_R1", status: "captured", amount: 9900, currency: "INR", method: "upi" }) },
  };
};

describe("plan access requires the completed confirmation workflow", () => {
  const originalCreate = razorpayClient.create;
  const useRazorpay = (client) => (razorpayClient.create = () => client);
  beforeEach(() => (razorpayClient.create = originalCreate));

  test("an 'active' subscription without an issued invoice does not unlock the plan", async () => {
    const user = await makeUser("buyer", { plan: "bronze" });
    const sub = await Subscription.create({
      userId: user._id,
      plan: "bronze",
      razorpay_subscription_id: "sub_1",
      status: "active",
      current_period_end: new Date(Date.now() + 30 * DAY),
    });
    await User.updateOne({ _id: user._id }, { activeSubscriptionId: sub._id });

    const { plan } = await refreshUserPlanFromSubscription(user._id);

    assert.equal(plan, "free");
    assert.equal((await User.findById(user._id)).plan, "free");
  });

  test("reconcile does not activate when Razorpay says active but the payment cannot be recorded", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });
    useRazorpay(fakeRazorpay({ syncFails: true }));

    const res = await callReconcile(user._id);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.userPlanDetails.plan, "free");
    assert.equal((await Subscription.findById(sub._id)).status, "authenticated", "waits for the invoice instead of copying 'active'");
    assert.equal((await User.findById(user._id)).plan, "free");
    assert.equal(await Payment.countDocuments(), 0);
  });

  test("reconcile activates through the invoice workflow once the payment can be recorded", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });
    useRazorpay(fakeRazorpay({ syncFails: true }));
    await callReconcile(user._id);
    useRazorpay(fakeRazorpay());

    const res = await callReconcile(user._id);

    assert.equal(res.body.userPlanDetails.plan, "bronze");
    assert.equal((await Subscription.findById(sub._id)).status, "active");
    const stored = await Payment.findOne({ razorpay_payment_id: "pay_R1" }).select("+invoice_pdf");
    assert.ok(stored.invoice_number);
    assert.equal(stored.invoice_pdf.subarray(0, 4).toString(), "%PDF");
    assert.ok(stored.invoice_email_attempts >= 1, "confirmation email was attempted and stays queued");
  });

  test("reconcile keeps a cancellation scheduled while Razorpay still reports the subscription active", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });
    await recordSubscriptionPayment(sub, { id: "pay_R1", amount: 9900, currency: "INR", method: "upi" }, {
      periodEnd: new Date(Date.now() + 30 * DAY),
    });
    await Subscription.updateOne({ _id: sub._id }, { status: "cancellation_pending", cancel_at_period_end: true });
    useRazorpay(fakeRazorpay());

    const res = await callReconcile(user._id);

    assert.equal(res.body.subscription.status, "cancellation_pending");
    assert.equal(res.body.userPlanDetails.plan, "bronze");
  });

  test("a cancelled webhook ends an unpaid subscription and keeps a paid one until its period ends", async () => {
    const payer = await makeUser("payer");
    const paid = await Subscription.create({ userId: payer._id, plan: "bronze", razorpay_subscription_id: "sub_paid" });
    const periodEnd = new Date(Date.now() + 30 * DAY);
    await recordSubscriptionPayment(paid, { id: "pay_P1", amount: 9900, currency: "INR", method: "card" }, { periodEnd });
    const visitor = await makeUser("visitor");
    const unpaid = await Subscription.create({ userId: visitor._id, plan: "bronze", razorpay_subscription_id: "sub_unpaid" });

    await endSubscription(paid._id, "cancelled", periodEnd);
    await endSubscription(unpaid._id, "cancelled", periodEnd);

    assert.equal((await Subscription.findById(paid._id)).status, "cancellation_pending");
    assert.equal((await User.findById(payer._id)).plan, "bronze");
    assert.equal((await Subscription.findById(unpaid._id)).status, "cancelled");
  });

  test("expiry downgrades the plan together with the subscription", async () => {
    const user = await makeUser("buyer");
    const sub = await Subscription.create({ userId: user._id, plan: "bronze", razorpay_subscription_id: "sub_1" });
    await recordSubscriptionPayment(sub, { id: "pay_E1", amount: 9900, currency: "INR", method: "card" }, {
      periodEnd: new Date(Date.now() + 30 * DAY),
    });
    await Subscription.updateOne({ _id: sub._id }, { current_period_end: new Date(Date.now() - 1000) });

    assert.equal(await expireDueSubscriptions(), 1);
    assert.equal(await expireDueSubscriptions(), 0, "a second run is a no-op");
    assert.equal((await Subscription.findById(sub._id)).status, "expired");
    assert.equal((await User.findById(user._id)).plan, "free");
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
    // History entries carry a translation key so they render in the viewer's language.
    assert.deepEqual(logs.map((l) => [l.detailKey, l.detailVars]), [["transferSent", { name: "receiver" }], ["transferReceived", undefined]]);
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

  test("a retried submission returns the first transfer instead of sending the points again", async () => {
    const sender = await makeUser("sender", { reputation: 100 });
    const receiver = await makeUser("receiver");
    const body = { receiverId: String(receiver._id), amount: 20, reason: "great answer", requestId: "req-retry-0001" };

    const first = await callTransfer(sender._id, body);
    const retry = await callTransfer(sender._id, body);

    assert.equal(first.statusCode, 201);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.duplicate, true);
    assert.equal(String(retry.body.data._id), String(first.body.data._id));
    assert.equal((await User.findById(sender._id)).reputation, 80);
    assert.equal(await ReputationTransfer.countDocuments(), 1);
  });

  test("simultaneous submissions with the same request id transfer once", async () => {
    const sender = await makeUser("sender", { reputation: 100 });
    const receiver = await makeUser("receiver");
    const body = { receiverId: String(receiver._id), amount: 20, reason: "great answer", requestId: "req-race-00001" };

    const results = await Promise.all([1, 2, 3].map(() => callTransfer(sender._id, body)));

    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
    assert.ok(results.every((r) => [200, 201].includes(r.statusCode)), "duplicates are answered with the original transfer");
    assert.equal((await User.findById(sender._id)).reputation, 80);
    assert.equal((await User.findById(receiver._id)).reputation, 120, "starting 100 + one transfer of 20");
    assert.equal(await ReputationTransfer.countDocuments(), 1);
    assert.equal(await ReputationLog.countDocuments(), 2);
  });

  test("a request id reused for a different transfer is rejected", async () => {
    const sender = await makeUser("sender", { reputation: 100 });
    const receiver = await makeUser("receiver");
    await callTransfer(sender._id, { receiverId: String(receiver._id), amount: 20, reason: "great answer", requestId: "req-reuse-0001" });

    const res = await callTransfer(sender._id, { receiverId: String(receiver._id), amount: 30, reason: "great answer", requestId: "req-reuse-0001" });

    assert.equal(res.statusCode, 409);
    assert.equal((await User.findById(sender._id)).reputation, 80);
  });

  test("suspended members cannot receive reputation", async () => {
    const sender = await makeUser("sender", { reputation: 100 });
    const receiver = await makeUser("receiver", { suspended: true });

    const res = await callTransfer(sender._id, { receiverId: String(receiver._id), amount: 20, reason: "great answer" });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "This member can't receive reputation right now");
    assert.equal((await User.findById(sender._id)).reputation, 100);
    assert.equal(await ReputationTransfer.countDocuments(), 0);
  });

  test("a transfer that loses a race on the balance reports the balance, not the daily limit", async () => {
    const sender = await makeUser("sender", { reputation: 90 });
    const receiver = await makeUser("receiver");

    // Both pass the up-front checks; only one can debit, after which the balance (45) is below the minimum.
    const results = await Promise.all(
      [1, 2].map(() => callTransfer(sender._id, { receiverId: String(receiver._id), amount: 45, reason: "thanks a lot" }))
    );

    assert.equal(results.filter((r) => r.statusCode === 201).length, 1);
    const failed = results.find((r) => r.statusCode !== 201);
    assert.equal(failed.statusCode, 400);
    assert.match(failed.body.message, /^You need more than 50 reputation/);
  });
});
