import mongoose from "mongoose";
import User from "../models/auth.js";
import ReputationLog from "../models/ReputationLog.js";
import { revokeUserSessions } from "./sessionService.js";
import { runInTransaction } from "./transaction.js";

export const REPUTATION_RULES = {
  answerPosted: 5,
  answerAccepted: 10,
  answerUpvoteMilestone: 5,
  answerUpvoteMilestoneVotes: 5,
  questionUpvoteMilestone: 2,
  questionUpvoteMilestoneVotes: 10,
  profileCompleted: 10,
  downvoteReceived: -2,
  answerDeletedByOwner: -5,
  contentRemovedByAdmin: -10,
};

export const PRIVILEGES = {
  comment: { threshold: 50, label: "Comment without restrictions" },
  editCommunityPosts: { threshold: 100, label: "Edit community posts" },
  voteToClose: { threshold: 250, label: "Vote to close questions" },
  report: { threshold: 500, label: "Report inappropriate content" },
};

export const TRANSFER_RULES = {
  minBalance: 50, // sender must have MORE than this
  maxPerTransaction: 50,
  maxPerDay: 100,
};

export const CLOSE_VOTES_REQUIRED = 3;

export const getPrivileges = (reputation = 0) =>
  Object.fromEntries(Object.entries(PRIVILEGES).map(([key, p]) => [key, reputation >= p.threshold]));

export const userHasPrivilege = async (userId, key) => {
  const user = await User.findById(userId).select("reputation role");
  if (!user) return false;
  if (user.role === "admin") return true;
  return (user.reputation ?? 0) >= PRIVILEGES[key].threshold;
};

// Atomically adjusts reputation and writes an activity-history entry. `session` is an optional mongoose session.
// `detail` is { key, vars } for the translated text of the entry (see ReputationLog.detailKey).
export const changeReputation = async (
  userId,
  delta,
  { type, reason, detail, note, actor, questionId, answerId, postId, transferId, session } = {}
) => {
  if (!delta || !userId || !mongoose.Types.ObjectId.isValid(String(userId))) return null;
  const user = await User.findByIdAndUpdate(userId, { $inc: { reputation: delta } }, { new: true, session }).select("reputation");
  if (!user) return null;
  await ReputationLog.create(
    [
      {
        user: userId,
        delta,
        type,
        reason,
        detailKey: detail?.key,
        detailVars: detail?.vars,
        note,
        balanceAfter: user.reputation,
        actor,
        questionId: questionId ? String(questionId) : undefined,
        answerId: answerId ? String(answerId) : undefined,
        postId: postId ? String(postId) : undefined,
        transferId,
      },
    ],
    { session }
  );
  return user.reputation;
};

export const isProfileComplete = (user) =>
  Boolean(user?.name?.trim() && user?.email && user?.phone && user?.about?.trim() && user?.tags?.length > 0);

// One-time +10 bonus the first time every mandatory profile field is filled in.
export const awardProfileCompletionBonus = async (user) => {
  if (!isProfileComplete(user) || user.profileBonusAwarded) return false;
  // The "awarded" flag and the +10 commit together, so a failure can never mark the bonus paid without paying it.
  return runInTransaction(async (session) => {
    const claimed = await User.findOneAndUpdate(
      { _id: user._id, profileBonusAwarded: { $ne: true } },
      { $set: { profileBonusAwarded: true } },
      { session }
    );
    if (!claimed) return false;
    await changeReputation(user._id, REPUTATION_RULES.profileCompleted, {
      type: "profile_completed",
      reason: "Completed all mandatory profile details",
      detail: { key: "profileCompleted" },
      session,
    });
    return true;
  });
};

export const AUTO_SUSPEND_AFTER_REMOVALS = () => {
  const value = parseInt(process.env.AUTO_SUSPEND_AFTER_REMOVALS, 10);
  return Number.isFinite(value) && value > 0 ? value : 3;
};

// -10 reputation for content removed by an administrator; repeat offenders are suspended automatically.
// The penalty, the removal count, the suspension and the session sign-out commit together. Pass the caller's
// `session` so they also commit with the removal of the content itself.
export const penalizeRemovedContent = async (ownerId, adminId, reason, refs = {}, { session } = {}) => {
  if (!ownerId || !mongoose.Types.ObjectId.isValid(String(ownerId))) return { suspended: false };
  if (!session) return runInTransaction((s) => penalizeRemovedContent(ownerId, adminId, reason, refs, { session: s }));
  await changeReputation(ownerId, REPUTATION_RULES.contentRemovedByAdmin, {
    type: "content_removed",
    reason,
    actor: adminId,
    ...refs,
    session,
  });
  const owner = await User.findByIdAndUpdate(ownerId, { $inc: { removedContentCount: 1 } }, { new: true, session }).select(
    "removedContentCount suspended role"
  );
  if (owner && !owner.suspended && owner.role !== "admin" && owner.removedContentCount >= AUTO_SUSPEND_AFTER_REMOVALS()) {
    await User.updateOne(
      { _id: ownerId },
      { suspended: true, suspendedReason: `Suspended automatically after ${owner.removedContentCount} content removals for guideline violations.` },
      { session }
    );
    await revokeUserSessions(ownerId, "suspended", undefined, { session });
    return { suspended: true };
  }
  return { suspended: false };
};
