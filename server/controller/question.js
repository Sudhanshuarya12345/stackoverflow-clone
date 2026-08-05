import mongoose from "mongoose";
import question from "../models/question.js";
import User from "../models/auth.js";
import { userMeetsPlan } from "../services/subscriptionAccess.js";


export const Askquestion = async (req, res) => {
  const { postquestiondata } = req.body;
  const postques = new question({ ...postquestiondata });
  try {
    await postques.save();

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
    const { tag, unanswered, q } = req.query;
    const usesAdvancedFilters = Boolean(tag || unanswered === "true" || q);

    if (usesAdvancedFilters) {
      if (!req.userid || !(await userMeetsPlan(req.userid, "bronze"))) {
        return res.status(403).json({ message: "Advanced search filters require a Bronze plan or higher." });
      }
    }

    const filter = {};
    if (tag) filter.questiontags = tag;
    if (unanswered === "true") filter.noofanswer = 0;
    if (q) filter.$text = { $search: q };

    const allquestion = await question.find(filter).sort({ askedon: -1 }).lean();
    
    const userIds = allquestion.map((q) => q.userid).filter(id => mongoose.Types.ObjectId.isValid(id));
    allquestion.forEach(q => {
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
    
    const planRank = { gold: 3, silver: 2, bronze: 1, free: 0 };
    const questionsWithPlan = allquestion.map(q => {
      const qPlan = userMap[q.userid?.toString()] || "free";
      const mappedAnswers = (q.answer || []).map(a => ({
         ...a,
         userplan: userMap[a.userid?.toString()] || "free"
      }));
      return { ...q, userplan: qPlan, answer: mappedAnswers };
    }).sort((a, b) => {
      if ((planRank[b.userplan] || 0) !== (planRank[a.userplan] || 0)) {
        return (planRank[b.userplan] || 0) - (planRank[a.userplan] || 0);
      }
      return new Date(b.askedon) - new Date(a.askedon);
    });

    res.status(200).json({ data: questionsWithPlan });
  } catch (error) {
    console.log(error);
    res.status(500).json("something went wrong..");
    return;
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
