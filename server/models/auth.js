import mongoose from "mongoose";

const userschema = mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  about: { type: String },
  tags: { type: [String] },
  joinDate: { type: Date, default: Date.now },
  plan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
  questionsToday: { type: Number, default: 0 },
  questionResetDate: { type: String },
  activeSubscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
  bookmarks: { type: [String], default: [] },
});
export default mongoose.model("user", userschema);
