import mongoose from "mongoose";
import User from "../models/auth.js";
import { BADGES } from "../config/badges.js";

const BADGES_USE_COUNTERS = [
  "questions",
  "answers",
  "acceptedAnswers",
  "questionUpvotes",
  "bountiesWon",
];

export const incBadgeCounter = async (userId, counter, n = 1) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId) || !BADGES_USE_COUNTERS.includes(counter)) return;
  await User.updateOne({ _id: userId }, { $inc: { [`badgeCounters.${counter}`]: n } });
};

export const awardBadgeIfEarned = async (userId, counter) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;
  const user = await User.findById(userId).select("badgeCounters reputation");
  if (!user) return;
  const counters = { ...(user.badgeCounters || {}) };
  if (counter === "reputation") counters.reputation = user.reputation ?? 100;

  for (const badge of Object.values(BADGES)) {
    if (badge.counter !== counter) continue;
    const current = counters[badge.counter] || 0;
    if (current < badge.threshold) continue;
    await User.updateOne(
      { _id: userId, "earnedBadges.key": { $ne: badge.key } },
      { $addToSet: { earnedBadges: { key: badge.key, name: badge.name, tier: badge.tier, awardedAt: new Date() } } }
    );
  }
};

export const evaluateBadges = async (userId, counter, n = 1) => {
  await incBadgeCounter(userId, counter, n);
  await awardBadgeIfEarned(userId, counter);
};