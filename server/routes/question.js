import express from "express";
import {
  Askquestion,
  deletequestion,
  getallquestion,
  getQuestionById,
  votequestion,
  toggleBookmark,
  addQuestionComment,
  addAnswerComment,
  addQuestionView,
  toggleFavorite,
  acceptAnswer,
  startBounty,
  awardBounty,
  voteAnswer,
  voteToClose,
} from "../controller/question.js";

const router = express.Router();
import auth from "../middleware/auth.js";
import { checkQuestionLimit } from "../middleware/requirePlan.js";
import optionalAuth from "../middleware/optionalAuth.js";
import requireActiveUser from "../middleware/requireActiveUser.js";

router.post("/ask", auth, requireActiveUser, checkQuestionLimit, Askquestion);
router.get("/getallquestion", optionalAuth, getallquestion);
router.get("/:id", optionalAuth, getQuestionById);
router.delete("/delete/:id", auth, deletequestion);
router.patch("/vote/:id", auth, requireActiveUser, votequestion);
router.patch("/bookmark/:id", auth, toggleBookmark);
router.post("/:id/comments", auth, requireActiveUser, addQuestionComment);
router.post("/:id/answers/:answerId/comments", auth, requireActiveUser, addAnswerComment);
router.patch("/:id/answers/:answerId/vote", auth, requireActiveUser, voteAnswer);
router.post("/:id/close", auth, requireActiveUser, voteToClose);
router.patch("/:id/view", addQuestionView);
router.patch("/:id/favorite", auth, toggleFavorite);
router.patch("/:id/answers/:answerId/accept", auth, acceptAnswer);
router.post("/:id/bounty/start", auth, startBounty);
router.patch("/:id/bounty/award/:answerId", auth, awardBounty);

export default router;
