import express from "express";
import {
  Askquestion,
  deletequestion,
  getallquestion,
  votequestion,
  toggleBookmark,
  addQuestionComment,
  addAnswerComment,
  addQuestionView,
  toggleFavorite,
  acceptAnswer,
} from "../controller/question.js";

const router = express.Router();
import auth from "../middleware/auth.js";
import { checkQuestionLimit } from "../middleware/requirePlan.js";
import optionalAuth from "../middleware/optionalAuth.js";

router.post("/ask", auth, checkQuestionLimit, Askquestion);
router.get("/getallquestion", optionalAuth, getallquestion);
router.delete("/delete/:id", auth, deletequestion);
router.patch("/vote/:id", auth, votequestion);
router.patch("/bookmark/:id", auth, toggleBookmark);
router.post("/:id/comments", auth, addQuestionComment);
router.post("/:id/answers/:answerId/comments", auth, addAnswerComment);
router.patch("/:id/view", addQuestionView);
router.patch("/:id/favorite", auth, toggleFavorite);
router.patch("/:id/answers/:answerId/accept", auth, acceptAnswer);

export default router;
