import User from "../models/auth.js";
import { PLANS, PLAN_LEVELS } from "../config/plans.js";
import { refreshUserPlanFromSubscription } from "../services/subscriptionAccess.js";

export const requirePlan = (minPlan) => {
  return async (req, res, next) => {
    try {
      await refreshUserPlanFromSubscription(req.userid);
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
    const refreshed = await refreshUserPlanFromSubscription(req.userid);
    const user = await User.findById(req.userid);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const todayDateStr = new Date().toISOString().split('T')[0]; // Midnight UTC
    const plan = refreshed.plan || user.plan || "free";
    const limit = PLANS[plan]?.dailyLimit || 1;

    if (limit === Infinity) {
      req.userState = {
        questionsToday: user.questionsToday || 0,
        questionResetDate: todayDateStr,
        reservedQuestionSlot: false,
      };
      return next();
    }

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: req.userid,
        $expr: {
          $lt: [
            {
              $cond: [
                { $eq: ["$questionResetDate", todayDateStr] },
                { $ifNull: ["$questionsToday", 0] },
                0,
              ],
            },
            limit,
          ],
        },
      },
      [
        {
          $set: {
            questionResetDate: todayDateStr,
            questionsToday: {
              $cond: [
                { $eq: ["$questionResetDate", todayDateStr] },
                { $add: [{ $ifNull: ["$questionsToday", 0] }, 1] },
                1,
              ],
            },
          },
        },
      ],
      { new: true }
    );

    if (!updatedUser) {
      return res.status(403).json({ message: `Daily question limit (${limit}) reached for your ${plan} plan.` });
    }

    req.userState = {
      questionsToday: updatedUser.questionsToday,
      questionResetDate: todayDateStr,
      reservedQuestionSlot: true,
    };

    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error checking daily limits" });
  }
};
