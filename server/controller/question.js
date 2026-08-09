import mongoose from "mongoose";
import question from "../models/question.js";
import User from "../models/auth.js";
import { userMeetsPlan } from "../services/subscriptionAccess.js";
import { evaluateBadges, awardBadgeIfEarned } from "../services/badgeService.js";

const BOUNTY_AMOUNTS = [50, 100, 200, 500];
const BOUNTY_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export const expireOldBounties = async () => {
  await question.updateMany(
    { "bounty.status": "active", "bounty.expiresAt": { $lte: new Date() } },
    { $set: { "bounty.status": "expired" } }
  );
};

let lastBountyExpiryRun = 0;
const BOUNTY_EXPIRY_INTERVAL_MS = 10 * 60 * 1000;

export const Askquestion = async (req, res) => {
  const { postquestiondata } = req.body;
  const postques = new question({ ...postquestiondata });
  try {
    await postques.save();
    await evaluateBadges(req.userid, "questions");
    res.status(200).json({ data: postques });
  } catch (error) {
    if (req.userState?.reservedQuestionSlot) {
      await User.findByIdAndUpdate(req.userid, { $inc: { questionsToday: -1 } });
    }
    console.log(error);
    res.status(500).json("something went wrong..");
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
        $lookup: {
          from: "users",
          localField: "userid",
          foreignField: "_id",
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

export const getQuestionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    const q = await question.findById(id).lean();
    if (!q) return res.status(404).json({ message: "Question not found" });

    const userIds = [q.userid].filter((u) => mongoose.Types.ObjectId.isValid(u));
    (q.answer || []).forEach((a) => {
      if (mongoose.Types.ObjectId.isValid(a.userid)) userIds.push(a.userid);
    });
    const users = await User.find({ _id: { $in: [...new Set(userIds)] } }).select("plan");
    const userMap = {};
    users.forEach((u) => { userMap[u._id.toString()] = u.plan; });

    const mappedAnswers = (q.answer || []).map((a) => ({
      ...a,
      userplan: userMap[a.userid?.toString()] || "free",
    }));
    res.status(200).json({
      data: { ...q, userplan: userMap[q.userid?.toString()] || "free", answer: mappedAnswers },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load question" });
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    if (!(await userMeetsPlan(req.userid, "silver"))) {
      return res.status(403).json({ message: "Unlimited bookmarks require a Silver plan or higher." });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }

    const existing = await User.findOne({ _id: req.userid, bookmarks: id });
    const update = existing ? { $pull: { bookmarks: id } } : { $addToSet: { bookmarks: id } };
    const user = await User.findByIdAndUpdate(req.userid, update, { new: true }).select("bookmarks");

    res.status(200).json({ bookmarked: !existing, bookmarks: user.bookmarks });
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

    const questionDoc = await question.findById(id).select("bounty");
    if (!questionDoc) return res.status(404).json({ message: "Question not found" });
    if (questionDoc.bounty?.status === "active" && questionDoc.bounty?.expiresAt > new Date()) {
      return res.status(409).json({ message: "This question already has an active bounty." });
    }

await User.updateOne(
      { _id: req.userid, reputation: { $exists: false } },
      { $set: { reputation: 100 } }
    );
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

    res.status(200).json({ data: updated, reputation: user.reputation });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not start bounty" });
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
      questionDoc.bounty.status = "expired";
      await questionDoc.save();
      return res.status(400).json({ message: "This bounty has expired." });
    }
    if (String(questionDoc.userid) !== String(req.userid) && String(questionDoc.bounty.startedBy) !== String(req.userid)) {
      return res.status(403).json({ message: "Only the question owner or bounty starter can award this bounty." });
    }

    const answer = questionDoc.answer.id(answerId);
    if (!answer) return res.status(404).json({ message: "Answer not found" });
    if (String(answer.userid) === String(req.userid)) {
      return res.status(400).json({ message: "You cannot award a bounty to your own answer." });
    }

questionDoc.bounty.status = "awarded";
    questionDoc.bounty.awardedToAnswerId = answerId;
    questionDoc.bounty.awardedToUserId = answer.userid;
    questionDoc.bounty.awardedAt = new Date();
    questionDoc.answer.forEach((ans) => {
      ans.isAccepted = String(ans._id) === String(answerId);
    });
    questionDoc.acceptedAnswerId = answerId;
    await questionDoc.save();

    if (mongoose.Types.ObjectId.isValid(answer.userid)) {
      await User.findByIdAndUpdate(answer.userid, { $inc: { reputation: questionDoc.bounty.amount } });
      await evaluateBadges(answer.userid, "bountiesWon");
      await awardBadgeIfEarned(answer.userid, "reputation");
    }

    res.status(200).json({ data: questionDoc });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not award bounty" });
  }
};

export const addQuestionComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, usercommented, userid, commentedon } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    if (!body?.trim()) {
      return res.status(400).json({ message: "Comment body is required" });
    }
    const updated = await question.findByIdAndUpdate(
      id,
      { $push: { comments: { body, usercommented, userid, commentedon } } },
      { new: true }
    );
    res.status(200).json({ data: updated });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add comment" });
  }
};

export const addAnswerComment = async (req, res) => {
  try {
    const { id, answerId } = req.params;
    const { body, usercommented, userid, commentedon } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(answerId)) {
      return res.status(400).json({ message: "question or answer unavailable" });
    }
    if (!body?.trim()) {
      return res.status(400).json({ message: "Comment body is required" });
    }
    const updated = await question.findOneAndUpdate(
      { _id: id, "answer._id": answerId },
      { $push: { "answer.$.comments": { body, usercommented, userid, commentedon } } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Answer not found" });
    res.status(200).json({ data: updated });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add answer comment" });
  }
};

export const addQuestionView = async (req, res) => {
  try {
    const { id } = req.params;
    const { count = 1 } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "question unavailable" });
    }
    const safeCount = Math.max(1, Math.min(Number(count) || 1, 500));
    const updated = await question.findByIdAndUpdate(id, { $inc: { views: safeCount } }, { new: true });
    res.status(200).json({ data: updated });
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
    res.status(200).json({ favorited: !existing, data: updated });
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
    questionDoc.answer.forEach((ans) => {
      ans.isAccepted = String(ans._id) === String(answerId);
    });
    questionDoc.acceptedAnswerId = answerId;
    await questionDoc.save();
    const acceptedAnswer = questionDoc.answer.id(answerId);
    if (acceptedAnswer) await evaluateBadges(acceptedAnswer.userid, "acceptedAnswers");
    res.status(200).json({ data: questionDoc });
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
    await question.findByIdAndDelete(_id);
    res.status(200).json({ message: "question deleted" });
  } catch (error) {
    res.status(500).json("something went wrong..");
    return;
  }
};
export const votequestion = async (req, res) => {
  const { id: _id } = req.params;
  const { value ,userid} = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  try {
    const questionDoc = await question.findById(_id);
    const upindex = questionDoc.upvote.findIndex((id) => id === String(userid));
    const downindex = questionDoc.downvote.findIndex(
      (id) => id === String(userid)
    );
    if (value === "upvote") {
      if (downindex !== -1) {
        questionDoc.downvote = questionDoc.downvote.filter(
          (id) => id !== String(userid)
        );
      }
      if (upindex === -1) {
        questionDoc.upvote.push(userid);
        await evaluateBadges(questionDoc.userid, "questionUpvotes");
      } else {
        questionDoc.upvote = questionDoc.upvote.filter((id) => id !== String(userid));
      }
    } else if (value === "downvote") {
      if (upindex !== -1) {
        questionDoc.upvote = questionDoc.upvote.filter((id) => id !== String(userid));
      }
      if (downindex === -1) {
        questionDoc.downvote.push(userid);
      } else {
        questionDoc.downvote = questionDoc.downvote.filter(
          (id) => id !== String(userid)
        );
      }
    }
    const questionvote = await question.findByIdAndUpdate(_id, questionDoc, { new: true });
    res.status(200).json({ data: questionvote });
  } catch (error) {
    res.status(500).json("something went wrong..");
    return;
  }
};
