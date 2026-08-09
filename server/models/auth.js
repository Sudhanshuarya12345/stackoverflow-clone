import mongoose from "mongoose";

const userschema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  about: { type: String },
  tags: { type: [String] },
  joinDate: { type: Date, default: Date.now },
  plan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
  reputation: { type: Number, default: 100 },
  questionsToday: { type: Number, default: 0 },
  questionResetDate: { type: String },
activeSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
  bookmarks: { type: [String], default: [] },
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
