import User from "../models/auth.js";
import { PLANS } from "../config/plans.js";

const PLAN_LEVELS = {
  free: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export const requirePlan = (minPlan) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userid);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userPlanLevel = PLAN_LEVELS[user.plan] || 0;
      const requiredPlanLevel = PLAN_LEVELS[minPlan] || 0;

      if (userPlanLevel < requiredPlanLevel) {
        return res.status(403).json({ message: `This feature requires a ${minPlan} plan or higher.` });
      }
      next();
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Server error checking plan" });
    }
  };
};

export const checkQuestionLimit = async (req, res, next) => {
  try {
    const user = await User.findById(req.userid);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const todayDateStr = new Date().toISOString().split('T')[0]; // Midnight UTC

    let updatedQuestionsToday = user.questionsToday || 0;
    if (user.questionResetDate !== todayDateStr) {
      updatedQuestionsToday = 0;
    }

    const limit = PLANS[user.plan]?.dailyLimit || 1;

    if (updatedQuestionsToday >= limit) {
      return res.status(403).json({ message: `Daily question limit (${limit}) reached for your ${user.plan} plan.` });
    }

    req.userState = {
      questionsToday: updatedQuestionsToday,
      questionResetDate: todayDateStr,
      userDoc: user
    };

    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error checking daily limits" });
  }
};
