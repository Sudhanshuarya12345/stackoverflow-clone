import dotenv from "dotenv";
dotenv.config();

export const PLANS = {
  free: {
    razorpayPlanId: null,
    price: 0,
    dailyLimit: 1,
  },
  bronze: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_BRONZE,
    price: 99,
    dailyLimit: 5,
  },
  silver: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_SILVER,
    price: 299,
    dailyLimit: 15,
  },
  gold: {
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_GOLD,
    price: 999,
    dailyLimit: Infinity,
  },
};
