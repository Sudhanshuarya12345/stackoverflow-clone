import Subscription from "../models/Subscription.js";
import User from "../models/auth.js";
import { PLAN_LEVELS } from "../config/plans.js";

export const isPaidSubscriptionUsable = (subscription, now = new Date()) => {
  if (!subscription) return false;
  if (!["active", "cancellation_pending"].includes(subscription.status)) return false;
  return subscription.current_period_end && new Date(subscription.current_period_end) > now;
};

export const refreshUserPlanFromSubscription = async (userId) => {
  const now = new Date();
  const sub = await Subscription.findOne({
    userId,
    status: { $in: ["active", "cancellation_pending"] },
  }).sort({ current_period_end: -1 });

  if (isPaidSubscriptionUsable(sub, now)) {
    await User.findByIdAndUpdate(userId, { plan: sub.plan, activeSubscriptionId: sub._id });
    return { plan: sub.plan, subscription: sub };
  }

  if (sub && sub.current_period_end && new Date(sub.current_period_end) <= now) {
    await Subscription.findByIdAndUpdate(sub._id, { status: "expired" });
  }

  await User.findByIdAndUpdate(userId, { plan: "free", $unset: { activeSubscriptionId: "" } });
  return { plan: "free", subscription: null };
};

export const userMeetsPlan = async (userId, minPlan) => {
  const { plan } = await refreshUserPlanFromSubscription(userId);
  return (PLAN_LEVELS[plan] || 0) >= (PLAN_LEVELS[minPlan] || 0);
};

export const expireDueSubscriptions = async () => {
  const now = new Date();
  const expiredSubs = await Subscription.find({
    status: { $in: ["active", "cancellation_pending"] },
    current_period_end: { $lte: now },
  });

  for (const sub of expiredSubs) {
    sub.status = "expired";
    await sub.save();
    await User.findByIdAndUpdate(sub.userId, { plan: "free", $unset: { activeSubscriptionId: "" } });
  }

  return expiredSubs.length;
};
