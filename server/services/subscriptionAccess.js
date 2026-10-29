import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import User from "../models/auth.js";
import { PLAN_LEVELS } from "../config/plans.js";
import { runInTransaction } from "./transaction.js";

export const isPaidSubscriptionUsable = (subscription, now = new Date()) => {
  if (!subscription) return false;
  if (!["active", "cancellation_pending"].includes(subscription.status)) return false;
  return subscription.current_period_end && new Date(subscription.current_period_end) > now;
};

// A subscription only grants its plan once the confirmation workflow has committed: a captured payment with an
// issued invoice, written in the same transaction as the activation (see recordSubscriptionPayment). This keeps
// a status copied from Razorpay, or set by any other code path, from unlocking a plan without an invoice.
export const hasIssuedInvoice = (subscriptionId) =>
  Payment.exists({ subscriptionId, status: "captured", invoice_number: { $exists: true } });

// Downgrades the user only if this subscription is still the one their plan comes from.
const downgradeIfCurrent = (sub, session) =>
  User.updateOne({ _id: sub.userId, activeSubscriptionId: sub._id }, { plan: "free", $unset: { activeSubscriptionId: "" } }, { session });

export const refreshUserPlanFromSubscription = async (userId) => {
  const now = new Date();
  const candidates = await Subscription.find({
    userId,
    status: { $in: ["active", "cancellation_pending"] },
  }).sort({ current_period_end: -1 });

  for (const sub of candidates) {
    if (!isPaidSubscriptionUsable(sub, now)) continue;
    if (!(await hasIssuedInvoice(sub._id))) continue;
    // Filtered so the user document is only written when the plan actually changed.
    await User.updateOne(
      { _id: userId, $or: [{ plan: { $ne: sub.plan } }, { activeSubscriptionId: { $ne: sub._id } }] },
      { plan: sub.plan, activeSubscriptionId: sub._id }
    );
    return { plan: sub.plan, subscription: sub };
  }

  for (const sub of candidates) {
    if (sub.current_period_end && new Date(sub.current_period_end) <= now) await expireSubscription(sub._id, now);
  }

  await User.updateOne(
    { _id: userId, $or: [{ plan: { $ne: "free" } }, { activeSubscriptionId: { $exists: true } }] },
    { plan: "free", $unset: { activeSubscriptionId: "" } }
  );
  return { plan: "free", subscription: null };
};

export const userMeetsPlan = async (userId, minPlan) => {
  const { plan } = await refreshUserPlanFromSubscription(userId);
  return (PLAN_LEVELS[plan] || 0) >= (PLAN_LEVELS[minPlan] || 0);
};

// Expiry and the plan downgrade commit together. The status filter makes a second caller a no-op.
const expireSubscription = (subscriptionId, now = new Date()) =>
  runInTransaction(async (session) => {
    const sub = await Subscription.findOneAndUpdate(
      { _id: subscriptionId, status: { $in: ["active", "cancellation_pending"] }, current_period_end: { $lte: now } },
      { status: "expired" },
      { new: true, session }
    );
    if (!sub) return false;
    await downgradeIfCurrent(sub, session);
    return true;
  });

export const expireDueSubscriptions = async () => {
  const now = new Date();
  const expiredSubs = await Subscription.find({
    status: { $in: ["active", "cancellation_pending"] },
    current_period_end: { $lte: now },
  }).select("_id");

  let expired = 0;
  for (const { _id } of expiredSubs) {
    if (await expireSubscription(_id, now)) expired += 1;
  }
  return expired;
};

// Ends a subscription Razorpay reports as cancelled/halted/completed. A paid subscription keeps its plan until
// the period it was paid for ends; otherwise the status change and the downgrade commit together.
export const endSubscription = (subscriptionId, status, periodEnd, now = new Date()) =>
  runInTransaction(async (session) => {
    const sub = await Subscription.findById(subscriptionId).session(session);
    if (!sub) return null;
    const end = periodEnd || sub.current_period_end;
    const wasPaid = ["active", "cancellation_pending"].includes(sub.status);
    if (wasPaid && end && end > now) {
      sub.status = "cancellation_pending";
      sub.cancel_at_period_end = true;
    } else {
      sub.status = status === "completed" ? "expired" : status;
    }
    sub.cancelled_at = sub.cancelled_at || now;
    if (end) sub.current_period_end = end;
    await sub.save({ session });
    if (sub.status !== "cancellation_pending") await downgradeIfCurrent(sub, session);
    return sub;
  });
