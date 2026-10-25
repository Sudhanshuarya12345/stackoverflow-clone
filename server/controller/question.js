import mongoose from "mongoose";
import question from "../models/question.js";
import User from "../models/auth.js";
import { refreshUserPlanFromSubscription, userMeetsPlan } from "../services/subscriptionAccess.js";
import { PLANS } from "../config/plans.js";
import { evaluateBadges, awardBadgeIfEarned, incBadgeCounter } from "../services/badgeService.js";
import {
  CLOSE_VOTES_REQUIRED,
  PRIVILEGES,
  REPUTATION_RULES,
  changeReputation,
  penalizeRemovedContent,
  userHasPrivilege,
} from "../services/reputationService.js";
import ReputationLog from "../models/ReputationLog.js";

const BOUNTY_AMOUNTS = [50, 100, 200, 500];
const BOUNTY_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Gives an unawarded bounty's reputation back to the member who offered it.
const refundBounty = async (bounty, questionId, title, reason) => {
  if (!bounty?.amount || !bounty.startedBy) return;
  await changeReputation(bounty.startedBy, bounty.amount, {
    type: "bounty_refunded",
    reason: `${reason} on "${title}"`,
    questionId,
  });
};

// Expires due bounties and refunds them. Each bounty is claimed atomically, so it is refunded exactly once
// even if the hourly job and a request handler expire it at the same time.
export const expireOldBounties = async (filter = {}) => {
  const due = await question
    .find({ ...filter, "bounty.status": "active", "bounty.expiresAt": { $lte: new Date() } })
    .select("_id");
  for (const { _id } of due) {
    const expired = await question.findOneAndUpdate(
      { _id, "bounty.status": "active", "bounty.expiresAt": { $lte: new Date() } },
      { $set: { "bounty.status": "expired" } }
    ).select("bounty questiontitle");
    if (expired) await refundBounty(expired.bounty, _id, expired.questiontitle, "Bounty expired without an award");
  }
};

let lastBountyExpiryRun = 0;
const BOUNTY_EXPIRY_INTERVAL_MS = 10 * 60 * 1000;

export const Askquestion = async (req, res) => {
  const { questiontitle, questionbody, questiontags } = req.body.postquestiondata || {};
  const releaseSlot = () =>
    req.userState?.reservedQuestionSlot && User.findByIdAndUpdate(req.userid, { $inc: { questionsToday: -1 } });
  const tags = Array.isArray(questiontags) ? questiontags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (!String(questiontitle || "").trim() || !String(questionbody || "").trim() || !tags.length) {
    await releaseSlot();
    return res.status(400).json({ message: "Title, body and at least one tag are required" });
  }
  const author = await User.findById(req.userid).select("name");
  if (!author) return res.status(404).json({ message: "User not found" });
  const postques = new question({
    questiontitle: String(questiontitle).trim(),
    questionbody,
    questiontags: tags,
    userposted: author.name,
    userid: String(req.userid),
  });
  try {
    await postques.save();
    await evaluateBadges(req.userid, "questions");
    res.status(200).json({ data: postques });
  } catch (error) {
    await releaseSlot();
    console.log(error);
    res.status(500).json({ message: "Could not post question" });
    return;
  }
};

export const getallquestion = async (req, res) => {
  try {
    const now = Date.now();
    if (now - lastBountyExpiryRun >= BOUNTY_EXPIRY_INTERVAL_MS) {
      lastBountyExpiryRun = now;
      await expireOldBounties();
    }

    const { tag, unanswered, q, bountied, sort } = req.query;
    const usesAdvancedFilters = Boolean(tag || unanswered === "true" || bountied === "true" || sort);

    if (usesAdvancedFilters) {
      if (!req.userid || !(await userMeetsPlan(req.userid, "bronze"))) {
        return res.status(403).json({ message: "Advanced search filters require a Bronze plan or higher." });
      }
    }

    const filter = {};
    if (tag) filter.questiontags = tag;
    if (unanswered === "true") filter.noofanswer = 0;
    if (q) filter.$text = { $search: q };
    if (bountied === "true") filter["bounty.status"] = "active";

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));

    const sortSpec = (() => {
      switch (sort) {
        case "active":
          return { lastActivity: -1, askedon: -1 };
        case "score":
          return { score: -1, askedon: -1 };
        case "views":
          return { views: -1, askedon: -1 };
        case "answered":
          return { noofanswer: -1, askedon: -1 };
        case "bountied":
          return { bountyAmount: -1, askedon: -1 };
        default:
          return { planRank: -1, askedon: -1 };
      }
    })();

    const [result] = await question.aggregate([
      { $match: filter },
      {
        // userid is stored as a string, so convert it before joining on the users' ObjectId.
        $lookup: {
          from: "users",
          let: { ownerId: { $convert: { input: "$userid", to: "objectId", onError: null, onNull: null } } },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$ownerId"] } } }, { $project: { plan: 1 } }],
          as: "owner",
        },
      },
      {
        $addFields: {
          planRank: {
            $switch: {
              branches: [
                { case: { $eq: [{ $arrayElemAt: ["$owner.plan", 0] }, "gold"] }, then: 3 },
                { case: { $eq: [{ $arrayElemAt: ["$owner.plan", 0] }, "silver"] }, then: 2 },
                { case: { $eq: [{ $arrayElemAt: ["$owner.plan", 0] }, "bronze"] }, then: 1 },
              ],
              default: 0,
            },
          },
          score: {
            $subtract: [
              { $size: { $ifNull: ["$upvote", []] } },
              { $size: { $ifNull: ["$downvote", []] } },
            ],
          },
          lastActivity: {
            $max: {
              $concatArrays: [
                ["$askedon"],
                { $ifNull: ["$answer.answeredon", []] },
              ],
            },
          },
          bountyAmount: { $ifNull: ["$bounty.amount", 0] },
        },
      },
      {
        $facet: {
          total: [{ $count: "count" }],
          items: [
            { $sort: sortSpec },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
        },
      },
    ]);

    const items = result.items || [];
    const total = result.total[0]?.count || 0;

    const userIds = items.map((q) => q.userid).filter(id => mongoose.Types.ObjectId.isValid(id));
    items.forEach(q => {
      if (q.answer && q.answer.length > 0) {
        q.answer.forEach(a => {
          if (mongoose.Types.ObjectId.isValid(a.userid)) userIds.push(a.userid);
        });
      }
    });

    const uniqueUserIds = [...new Set(userIds)];
    const users = await User.find({ _id: { $in: uniqueUserIds } }).select("plan");

    const userMap = {};
    users.forEach(u => userMap[u._id.toString()] = u.plan);

    const data = items.map(q => {
      const qPlan = q.owner?.[0]?.plan || userMap[q.userid?.toString()] || "free";
      const mappedAnswers = (q.answer || []).map(a => ({
         ...a,
         userplan: userMap[a.userid?.toString()] || "free"
      }));
      const { owner, ...rest } = q;
      return { ...rest, userplan: qPlan, answer: mappedAnswers };
    });

    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.log(error);
    res.status(500).json("something went wrong..");
    return;
  }
};

// Attaches each author's current plan to a question and its answers (drives plan badges in the UI).
export const withPlans = async (doc) => {
  if (!doc) return doc;
  const q = doc.toObject ? doc.toObject() : doc;
  const userIds = [q.userid, ...(q.answer || []).map((a) => a.userid)].filter((u) => mongoose.Types.ObjectId.isValid(u));
  const users = await User.find({ _id: { $in: [...new Set(userIds)] } }).select("plan");
  const userMap = {};
  users.forEach((u) => {
    userMap[u._id.toString()] = u.plan;
  });
  return {
    ...q,
    closeVotesRequired: CLOSE_VOTES_REQUIRED,
    userplan: userMap[q.userid?.toString()] || "free",
    answer: (q.answer || []).map((a) => ({ ...a, userplan: userMap[a.userid?.toString()] || "free" })),
  };
};

export const getQuestionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    const q = await question.findById(id).lean();
    if (!q) return res.status(404).json({ message: "Question not found" });
    const data = await withPlans(q);
    if (req.userid) {
      const me = await User.findById(req.userid).select("bookmarks");
      data.isBookmarked = Boolean(me?.bookmarks?.includes(String(id)));
    }
    res.status(200).json({ data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load question" });
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }

    const existing = await User.findOne({ _id: req.userid, bookmarks: id });
    if (existing) {
      const user = await User.findByIdAndUpdate(req.userid, { $pull: { bookmarks: id } }, { new: true }).select("bookmarks");
      return res.status(200).json({ bookmarked: false, bookmarks: user.bookmarks });
    }

    // Free and Bronze members get a small bookmark allowance; Silver and Gold are unlimited.
    const { plan } = await refreshUserPlanFromSubscription(req.userid);
    const limit = PLANS[plan]?.bookmarkLimit ?? PLANS.free.bookmarkLimit;
    const filter = { _id: req.userid };
    if (Number.isFinite(limit)) filter[`bookmarks.${limit - 1}`] = { $exists: false };
    const user = await User.findOneAndUpdate(filter, { $addToSet: { bookmarks: id } }, { new: true }).select("bookmarks");
    if (!user) {
      return res.status(403).json({
        message: `Your ${plan} plan allows ${limit} bookmarks. Upgrade to Silver or Gold for unlimited bookmarks.`,
      });
    }

    res.status(200).json({ bookmarked: true, bookmarks: user.bookmarks });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update bookmark" });
  }
};


export const startBounty = async (req, res) => {
  try {
    const { id } = req.params;
    const amount = Number(req.body.amount);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    if (!BOUNTY_AMOUNTS.includes(amount)) {
      return res.status(400).json({ message: "Choose a valid bounty amount." });
    }

    const questionDoc = await question.findById(id).select("bounty closed");
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    if (questionDoc.closed) return res.status(400).json({ message: "Closed questions cannot receive bounties." });
    // Refund a previous bounty that has run out before it is replaced by the new one.
    await expireOldBounties({ _id: questionDoc._id });
    if (questionDoc.bounty?.status === "active" && questionDoc.bounty?.expiresAt > new Date()) {
      return res.status(409).json({ message: "This question already has an active bounty." });
    }

    await User.updateOne({ _id: req.userid, reputation: { $exists: false } }, { $set: { reputation: 100 } });
    const user = await User.findOneAndUpdate(
      { _id: req.userid, reputation: { $gte: amount } },
      { $inc: { reputation: -amount } },
      { new: true }
    ).select("reputation");
    if (!user) {
      return res.status(400).json({ message: "Not enough reputation to start this bounty." });
    }

    const now = new Date();
    const updated = await question.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { "bounty.status": { $ne: "active" } },
          { "bounty.status": { $exists: false } },
          { "bounty.expiresAt": { $lte: now } },
        ],
      },
      {
        $set: {
          bounty: {
            amount,
            status: "active",
            startedBy: req.userid,
            startedAt: now,
            expiresAt: new Date(now.getTime() + BOUNTY_DURATION_MS),
          },
        },
      },
      { new: true }
    );

    if (!updated) {
      await User.findByIdAndUpdate(req.userid, { $inc: { reputation: amount } });
      return res.status(409).json({ message: "This question already has an active bounty." });
    }
    await ReputationLog.create({
      user: req.userid,
      delta: -amount,
      type: "bounty_started",
      reason: `Offered a bounty on "${updated.questiontitle}"`,
      balanceAfter: user.reputation,
      questionId: id,
    });

    res.status(200).json({ data: updated, reputation: user.reputation });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not start bounty" });
  }
};

// Marks answerId as accepted (or clears acceptance when answerId is null) and moves the +10 accordingly.
const applyAcceptance = async (questionDoc, answerId, actorId) => {
  const previous = questionDoc.answer.find((ans) => ans.isAccepted);
  const next = answerId ? questionDoc.answer.id(answerId) : null;
  questionDoc.answer.forEach((ans) => {
    ans.isAccepted = Boolean(next) && String(ans._id) === String(next._id);
  });
  questionDoc.acceptedAnswerId = next ? String(next._id) : undefined;
  await questionDoc.save();

  if (previous && (!next || String(previous._id) !== String(next._id)) && previous.userid !== questionDoc.userid) {
    await changeReputation(previous.userid, -REPUTATION_RULES.answerAccepted, {
      type: "accept_revoked",
      reason: `Answer on "${questionDoc.questiontitle}" is no longer accepted`,
      actor: actorId,
      questionId: questionDoc._id,
      answerId: previous._id,
    });
  }
  if (next && (!previous || String(previous._id) !== String(next._id)) && next.userid !== questionDoc.userid) {
    await changeReputation(next.userid, REPUTATION_RULES.answerAccepted, {
      type: "answer_accepted",
      reason: `Answer accepted on "${questionDoc.questiontitle}"`,
      actor: actorId,
      questionId: questionDoc._id,
      answerId: next._id,
    });
    await evaluateBadges(next.userid, "acceptedAnswers");
  }
};

export const awardBounty = async (req, res) => {
  try {
    const { id, answerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(answerId)) {
      return res.status(400).json({ message: "question or answer unavailable" });
    }

    const questionDoc = await question.findById(id);
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    if (questionDoc.bounty?.status !== "active") {
      return res.status(400).json({ message: "This question does not have an active bounty." });
    }
    if (questionDoc.bounty.expiresAt && questionDoc.bounty.expiresAt <= new Date()) {
      await expireOldBounties({ _id: questionDoc._id });
      return res.status(400).json({ message: "This bounty has expired and was refunded." });
    }
    if (String(questionDoc.userid) !== String(req.userid) && String(questionDoc.bounty.startedBy) !== String(req.userid)) {
      return res.status(403).json({ message: "Only the question owner or bounty starter can award this bounty." });
    }

    const answer = questionDoc.answer.id(answerId);
    if (!answer) return res.status(404).json({ message: "Answer not found" });
    if (String(answer.userid) === String(req.userid)) {
      return res.status(400).json({ message: "You cannot award a bounty to your own answer." });
    }

    // Claim the bounty atomically so a double click cannot pay it out twice.
    const claimed = await question.findOneAndUpdate(
      { _id: id, "bounty.status": "active" },
      {
        $set: {
          "bounty.status": "awarded",
          "bounty.awardedToAnswerId": answerId,
          "bounty.awardedToUserId": answer.userid,
          "bounty.awardedAt": new Date(),
        },
      },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: "This bounty was already awarded." });
    // Only the question owner decides the accepted answer; a third-party bounty starter just awards the bounty.
    const isOwner = String(questionDoc.userid) === String(req.userid);
    if (isOwner && !claimed.answer.id(answerId)?.isAccepted) await applyAcceptance(claimed, answerId, req.userid);

    if (mongoose.Types.ObjectId.isValid(answer.userid)) {
      await changeReputation(answer.userid, questionDoc.bounty.amount, {
        type: "bounty_awarded",
        reason: `Won a +${questionDoc.bounty.amount} bounty on "${questionDoc.questiontitle}"`,
        actor: req.userid,
        questionId: id,
        answerId,
      });
      await evaluateBadges(answer.userid, "bountiesWon");
      await awardBadgeIfEarned(answer.userid, "reputation");
    }

    res.status(200).json({ data: await withPlans(await question.findById(id)) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not award bounty" });
  }
};

const commentPrivilegeError = async (userId, ownerIds) => {
  if (ownerIds.some((ownerId) => String(ownerId) === String(userId))) return null;
  if (await userHasPrivilege(userId, "comment")) return null;
  return `You need ${PRIVILEGES.comment.threshold} reputation to comment on other people's posts. You can still comment on your own.`;
};

export const addQuestionComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { body } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    if (!body?.trim()) {
      return res.status(400).json({ message: "Comment body is required" });
    }
    const questionDoc = await question.findById(id).select("userid");
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    const privilegeError = await commentPrivilegeError(req.userid, [questionDoc.userid]);
    if (privilegeError) return res.status(403).json({ message: privilegeError });
    const author = await User.findById(req.userid).select("name");
    const updated = await question.findByIdAndUpdate(
      id,
      { $push: { comments: { body: body.trim(), usercommented: author?.name, userid: String(req.userid) } } },
      { new: true }
    );
    res.status(200).json({ data: await withPlans(updated) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add comment" });
  }
};

export const addAnswerComment = async (req, res) => {
  try {
    const { id, answerId } = req.params;
    const { body } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(answerId)) {
      return res.status(400).json({ message: "question or answer unavailable" });
    }
    if (!body?.trim()) {
      return res.status(400).json({ message: "Comment body is required" });
    }
    const questionDoc = await question.findById(id).select("userid answer._id answer.userid");
    const answer = questionDoc?.answer.id(answerId);
    if (!answer) return res.status(404).json({ message: "Answer not found" });
    const privilegeError = await commentPrivilegeError(req.userid, [answer.userid, questionDoc.userid]);
    if (privilegeError) return res.status(403).json({ message: privilegeError });
    const author = await User.findById(req.userid).select("name");
    const updated = await question.findOneAndUpdate(
      { _id: id, "answer._id": answerId },
      { $push: { "answer.$.comments": { body: body.trim(), usercommented: author?.name, userid: String(req.userid) } } },
      { new: true }
    );
    res.status(200).json({ data: await withPlans(updated) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add answer comment" });
  }
};

export const addQuestionView = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    const updated = await question.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true }).select("views");
    res.status(200).json({ views: updated?.views || 0 });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add view" });
  }
};

export const toggleFavorite = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    const existing = await question.findOne({ _id: id, favorites: req.userid });
    const update = existing ? { $pull: { favorites: req.userid } } : { $addToSet: { favorites: req.userid } };
    const updated = await question.findByIdAndUpdate(id, update, { new: true });
    res.status(200).json({ favorited: !existing, data: await withPlans(updated) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update favorite" });
  }
};

export const acceptAnswer = async (req, res) => {
  try {
    const { id, answerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(answerId)) {
      return res.status(400).json({ message: "question or answer unavailable" });
    }
    const questionDoc = await question.findById(id);
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    if (String(questionDoc.userid) !== String(req.userid)) {
      return res.status(403).json({ message: "Only the question owner can accept an answer" });
    }
    const target = questionDoc.answer.id(answerId);
    if (!target) return res.status(404).json({ message: "Answer not found" });
    // Clicking accept on the already-accepted answer un-accepts it.
    await applyAcceptance(questionDoc, target.isAccepted ? null : answerId, req.userid);
    res.status(200).json({ data: await withPlans(questionDoc) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not accept answer" });
  }
};

export const deletequestion = async (req, res) => {
  const { id: _id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  try {
    const questionDoc = await question.findById(_id).select("userid questiontitle");
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    const isOwner = String(questionDoc.userid) === String(req.userid);
    const actor = await User.findById(req.userid).select("role");
    const isAdmin = actor?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "You can only delete your own questions" });
    }
    const deleted = await question.findByIdAndDelete(_id);
    // A bounty that can no longer be awarded goes back to whoever offered it.
    if (deleted?.bounty?.status === "active") {
      await refundBounty(deleted.bounty, _id, deleted.questiontitle, "Bounty returned because the question was deleted");
    }
    if (!isOwner && isAdmin) {
      await penalizeRemovedContent(questionDoc.userid, req.userid, `Question "${questionDoc.questiontitle}" removed by an administrator`, { questionId: _id });
    }
    res.status(200).json({ message: "question deleted" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};

// Atomically toggles one voter's vote on a question (answerId omitted) or on one of its answers.
// Every write is conditional on the voter's current state, so concurrent votes never overwrite each other
// and a double click cannot apply the same reputation effect twice.
const castVote = async (questionId, answerId, voterId, value) => {
  const voter = String(voterId);
  const own = value === "upvote" ? "upvote" : "downvote";
  const other = own === "upvote" ? "downvote" : "upvote";
  const filter = (field, condition) =>
    answerId
      ? { _id: questionId, answer: { $elemMatch: { _id: answerId, [field]: condition } } }
      : { _id: questionId, [field]: condition };
  const path = (field) => (answerId ? `answer.$.${field}` : field);
  const votesOf = (doc) => (answerId ? doc.answer.id(answerId) : doc);

  let removed = false;
  let added = false;
  let removedOther = false;
  // Clicking the same vote again retracts it.
  if (await question.findOneAndUpdate(filter(own, voter), { $pull: { [path(own)]: voter } })) {
    removed = true;
  } else {
    const before = await question.findOneAndUpdate(filter(own, { $ne: voter }), {
      $addToSet: { [path(own)]: voter },
      $pull: { [path(other)]: voter },
    });
    if (!before) return null;
    added = true;
    removedOther = (votesOf(before)?.[other] || []).includes(voter);
  }
  const isUp = own === "upvote";
  return {
    newUpvote: isUp && added,
    upvoteRemoved: (isUp && removed) || (!isUp && removedOther),
    downvoteAdded: !isUp && added,
    downvoteRemoved: (!isUp && removed) || (isUp && removedOther),
  };
};

const applyDownvoteReputation = async (effects, ownerId, voterId, what, refs) => {
  if (effects.downvoteAdded) {
    await changeReputation(ownerId, REPUTATION_RULES.downvoteReceived, {
      type: "downvote_received",
      reason: `Your ${what} received a downvote`,
      actor: voterId,
      ...refs,
    });
  } else if (effects.downvoteRemoved) {
    await changeReputation(ownerId, -REPUTATION_RULES.downvoteReceived, {
      type: "downvote_retracted",
      reason: `A downvote on your ${what} was removed`,
      actor: voterId,
      ...refs,
    });
  }
};

export const votequestion = async (req, res) => {
  const { id: _id } = req.params;
  const { value } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  if (!["upvote", "downvote"].includes(value)) return res.status(400).json({ message: "Invalid vote" });
  try {
    const questionDoc = await question.findById(_id).select("userid questiontitle");
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    if (String(questionDoc.userid) === String(req.userid)) {
      return res.status(400).json({ message: "You cannot vote on your own question" });
    }
    const effects = await castVote(_id, null, req.userid, value);
    if (!effects) return res.status(404).json({ message: "Question not found" });

    // The badge counter follows live upvotes, so toggling a vote on and off cannot farm badges.
    if (effects.newUpvote) await evaluateBadges(questionDoc.userid, "questionUpvotes");
    if (effects.upvoteRemoved) await incBadgeCounter(questionDoc.userid, "questionUpvotes", -1);
    await applyDownvoteReputation(effects, questionDoc.userid, req.userid, "question", { questionId: _id });

    const fresh = await question.findById(_id);
    if (fresh.upvote.length >= REPUTATION_RULES.questionUpvoteMilestoneVotes) {
      const claimed = await question.findOneAndUpdate(
        { _id, upvoteMilestoneAwarded: { $ne: true } },
        { $set: { upvoteMilestoneAwarded: true } }
      );
      if (claimed) {
        await changeReputation(questionDoc.userid, REPUTATION_RULES.questionUpvoteMilestone, {
          type: "question_upvote_milestone",
          reason: `Your question "${questionDoc.questiontitle}" reached ${REPUTATION_RULES.questionUpvoteMilestoneVotes} upvotes`,
          questionId: _id,
        });
      }
    }
    res.status(200).json({ data: await withPlans(await question.findById(_id)) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};

export const voteAnswer = async (req, res) => {
  const { id, answerId } = req.params;
  const { value } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(answerId)) {
    return res.status(400).json({ message: "question or answer unavailable" });
  }
  if (!["upvote", "downvote"].includes(value)) return res.status(400).json({ message: "Invalid vote" });
  try {
    const questionDoc = await question.findById(id).select("questiontitle answer._id answer.userid");
    const answer = questionDoc?.answer.id(answerId);
    if (!answer) return res.status(404).json({ message: "Answer not found" });
    if (String(answer.userid) === String(req.userid)) {
      return res.status(400).json({ message: "You cannot vote on your own answer" });
    }
    const effects = await castVote(id, answerId, req.userid, value);
    if (!effects) return res.status(404).json({ message: "Answer not found" });

    await applyDownvoteReputation(effects, answer.userid, req.userid, "answer", { questionId: id, answerId });

    const fresh = (await question.findById(id)).answer.id(answerId);
    if ((fresh?.upvote?.length || 0) >= REPUTATION_RULES.answerUpvoteMilestoneVotes) {
      const claimed = await question.findOneAndUpdate(
        { _id: id, answer: { $elemMatch: { _id: answerId, upvoteMilestoneAwarded: { $ne: true } } } },
        { $set: { "answer.$.upvoteMilestoneAwarded": true } }
      );
      if (claimed) {
        await changeReputation(answer.userid, REPUTATION_RULES.answerUpvoteMilestone, {
          type: "answer_upvote_milestone",
          reason: `Your answer on "${questionDoc.questiontitle}" reached ${REPUTATION_RULES.answerUpvoteMilestoneVotes} upvotes`,
          questionId: id,
          answerId,
        });
      }
    }
    res.status(200).json({ data: await withPlans(await question.findById(id)) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not record vote" });
  }
};

export const voteToClose = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "question unavailable" });
  try {
    if (!(await userHasPrivilege(req.userid, "voteToClose"))) {
      return res.status(403).json({ message: `You need ${PRIVILEGES.voteToClose.threshold} reputation to vote to close questions.` });
    }
    const updated = await question.findOneAndUpdate(
      { _id: id, closed: { $ne: true }, closeVotes: { $ne: String(req.userid) } },
      { $addToSet: { closeVotes: String(req.userid) } },
      { new: true }
    );
    if (!updated) {
      const exists = await question.findById(id).select("closed");
      if (!exists) return res.status(404).json({ message: "Question not found" });
      return res.status(400).json({ message: exists.closed ? "This question is already closed." : "You already voted to close this question." });
    }
    if (updated.closeVotes.length >= CLOSE_VOTES_REQUIRED) {
      await question.updateOne({ _id: id, closed: { $ne: true } }, { closed: true, closedAt: new Date() });
    }
    res.status(200).json({ data: await withPlans(await question.findById(id)), closeVotesRequired: CLOSE_VOTES_REQUIRED });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not record close vote" });
  }
};
