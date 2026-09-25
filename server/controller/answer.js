import mongoose from "mongoose";
import question from "../models/question.js";
import User from "../models/auth.js";
import { evaluateBadges } from "../services/badgeService.js";
import { REPUTATION_RULES, changeReputation, penalizeRemovedContent } from "../services/reputationService.js";
import { withPlans } from "./question.js";

export const Askanswer = async (req, res) => {
  const { id: _id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  const answerbody = String(req.body.answerbody || "").trim();
  if (!answerbody) return res.status(400).json({ message: "Answer body is required" });

  try {
    const author = await User.findById(req.userid).select("name");
    if (!author) return res.status(404).json({ message: "User not found" });
    const updatequestion = await question.findOneAndUpdate(
      { _id, closed: { $ne: true } },
      {
        $push: { answer: { answerbody, useranswered: author.name, userid: String(req.userid) } },
        $inc: { noofanswer: 1 },
      },
      { new: true }
    );
    if (!updatequestion) {
      const exists = await question.exists({ _id });
      return res.status(exists ? 400 : 404).json({ message: exists ? "This question is closed and no longer accepts answers." : "Question not found" });
    }
    const newAnswer = updatequestion.answer[updatequestion.answer.length - 1];
    await changeReputation(req.userid, REPUTATION_RULES.answerPosted, {
      type: "answer_posted",
      reason: `Posted an answer on "${updatequestion.questiontitle}"`,
      questionId: _id,
      answerId: newAnswer?._id,
    });
    await evaluateBadges(req.userid, "answers");
    res.status(200).json({ data: await withPlans(updatequestion) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};

export const deleteanswer = async (req, res) => {
  const { id: _id } = req.params;
  const { answerid } = req.body;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "question unavailable" });
  }
  if (!mongoose.Types.ObjectId.isValid(answerid)) {
    return res.status(400).json({ message: "answer unavailable" });
  }
  try {
    const questionDoc = await question.findById(_id);
    const answer = questionDoc?.answer.id(answerid);
    if (!answer) return res.status(404).json({ message: "Answer not found" });
    const isOwner = String(answer.userid) === String(req.userid);
    const actor = await User.findById(req.userid).select("role");
    const isAdmin = actor?.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: "You can only delete your own answers" });
    }

    const wasAccepted = answer.isAccepted;
    const updatequestion = await question.findOneAndUpdate(
      { _id, "answer._id": answerid },
      {
        $pull: { answer: { _id: answerid } },
        $inc: { noofanswer: -1 },
        ...(wasAccepted ? { $unset: { acceptedAnswerId: "" } } : {}),
      },
      { new: true }
    );
    if (!updatequestion) return res.status(404).json({ message: "Answer not found" });

    if (isOwner) {
      await changeReputation(answer.userid, REPUTATION_RULES.answerDeletedByOwner, {
        type: "answer_deleted",
        reason: `Deleted your answer on "${questionDoc.questiontitle}"`,
        questionId: _id,
        answerId: answerid,
      });
    } else {
      await penalizeRemovedContent(answer.userid, req.userid, `Answer on "${questionDoc.questiontitle}" removed by an administrator`, {
        questionId: _id,
        answerId: answerid,
      });
    }
    res.status(200).json({ data: await withPlans(updatequestion) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};
