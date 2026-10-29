import mongoose from "mongoose";
import question from "../models/question.js";
import User from "../models/auth.js";
import { evaluateBadges } from "../services/badgeService.js";
import { REPUTATION_RULES, changeReputation, penalizeRemovedContent } from "../services/reputationService.js";
import { withPlans } from "./question.js";
import { runInTransaction } from "../services/transaction.js";

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
    // The answer and its +5 commit together.
    const updatequestion = await runInTransaction(async (session) => {
      const updated = await question.findOneAndUpdate(
        { _id, closed: { $ne: true } },
        {
          $push: { answer: { answerbody, useranswered: author.name, userid: String(req.userid) } },
          $inc: { noofanswer: 1 },
        },
        { new: true, session }
      );
      if (!updated) return null;
      const newAnswer = updated.answer[updated.answer.length - 1];
      await changeReputation(req.userid, REPUTATION_RULES.answerPosted, {
        type: "answer_posted",
        reason: `Posted an answer on "${updated.questiontitle}"`,
        detail: { key: "answerPosted", vars: { title: updated.questiontitle } },
        questionId: _id,
        answerId: newAnswer?._id,
        session,
      });
      return updated;
    });
    if (!updatequestion) {
      const exists = await question.exists({ _id });
      return res.status(exists ? 400 : 404).json({ message: exists ? "This question is closed and no longer accepts answers." : "Question not found" });
    }
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
    // Removing the answer and every reputation change it causes commit together.
    const updatequestion = await runInTransaction(async (session) => {
      const updated = await question.findOneAndUpdate(
        { _id, "answer._id": answerid },
        {
          $pull: { answer: { _id: answerid } },
          $inc: { noofanswer: -1 },
          ...(wasAccepted ? { $unset: { acceptedAnswerId: "" } } : {}),
        },
        { new: true, session }
      );
      if (!updated) return null;

      // An accepted answer that disappears no longer earns its +10.
      if (wasAccepted && String(answer.userid) !== String(questionDoc.userid)) {
        await changeReputation(answer.userid, -REPUTATION_RULES.answerAccepted, {
          type: "accept_revoked",
          reason: `Accepted answer on "${questionDoc.questiontitle}" was deleted`,
          detail: { key: "acceptedAnswerDeleted", vars: { title: questionDoc.questiontitle } },
          actor: req.userid,
          questionId: _id,
          answerId: answerid,
          session,
        });
      }
      if (isOwner) {
        await changeReputation(answer.userid, REPUTATION_RULES.answerDeletedByOwner, {
          type: "answer_deleted",
          reason: `Deleted your answer on "${questionDoc.questiontitle}"`,
          detail: { key: "answerDeleted", vars: { title: questionDoc.questiontitle } },
          questionId: _id,
          answerId: answerid,
          session,
        });
      } else {
        await penalizeRemovedContent(
          answer.userid,
          req.userid,
          `Answer on "${questionDoc.questiontitle}" removed by an administrator`,
          { questionId: _id, answerId: answerid, detail: { key: "answerRemoved", vars: { title: questionDoc.questiontitle } } },
          { session }
        );
      }
      return updated;
    });
    if (!updatequestion) return res.status(404).json({ message: "Answer not found" });
    res.status(200).json({ data: await withPlans(updatequestion) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};
