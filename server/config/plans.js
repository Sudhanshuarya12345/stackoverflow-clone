import dotenv from "dotenv";
dotenv.config();

export const PLANS = {
  free: {
    razorpayPlanId: null,
    price: 0,
    amountPaise: 0,
    currency: "INR",
    dailyLimit: 1,
    bookmarkLimit: 5,
    features: ["basicSearch"],
  },
  bronze: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_BRONZE,
    price: 99,
    amountPaise: 9900,
    currency: "INR",
    dailyLimit: 5,
    bookmarkLimit: 10,
    features: ["badge", "advancedSearch"],
  },
  silver: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_SILVER,
    price: 299,
    amountPaise: 29900,
    currency: "INR",
    dailyLimit: 15,
    bookmarkLimit: Infinity,
    features: ["badge", "advancedSearch", "prioritySupport", "enhancedProfile", "unlimitedBookmarks"],
  },
  gold: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_GOLD,
    price: 999,
    amountPaise: 99900,
    currency: "INR",
    dailyLimit: Infinity,
    bookmarkLimit: Infinity,
    features: ["badge", "advancedSearch", "prioritySupport", "featuredProfile", "highestSearchPriority", "exclusiveCommunity"],
  },
};

export const PLAN_LEVELS = {
  free: 0,
  bronze: 1,
  silver: 2,
  gold: 3,
};

export const getPlanFromRazorpayPlanId = (razorpayPlanId) => {
  return Object.entries(PLANS).find(([, config]) => config.razorpayPlanId === razorpayPlanId)?.[0];
};
