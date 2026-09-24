import mongoose from "mongoose";

const userschema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  password: { type: String, required: true },
  about: { type: String },
  tags: { type: [String] },
  joinDate: { type: Date, default: Date.now },
  plan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  suspended: { type: Boolean, default: false },
  suspendedReason: { type: String },
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  reputation: { type: Number, default: 100 },
  questionsToday: { type: Number, default: 0 },
  questionResetDate: { type: String },
  forgotPasswordDate: { type: String },
  forgotPasswordAttempts: { type: Number, default: 0 },
  activeSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
  bookmarks: { type: [String], default: [] },
  earnedBadges: {
    type: [
      {
        key: { type: String },
        tier: { type: String, enum: ["gold", "silver", "bronze"] },
        awardedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  badgeCounters: {
    questions: { type: Number, default: 0 },
    answers: { type: Number, default: 0 },
    acceptedAnswers: { type: Number, default: 0 },
    questionUpvotes: { type: Number, default: 0 },
    bountiesWon: { type: Number, default: 0 },
  },
  billingDetails: {
    billingName: { type: String },
    billingEmail: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    postalCode: { type: String },
    gstNumber: { type: String },
  },
});
export default mongoose.model("user", userschema);
