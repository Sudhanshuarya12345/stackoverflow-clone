import mongoose from "mongoose";

const subscriptionSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    plan: { type: String, enum: ["free", "bronze", "silver", "gold"], required: true },
    razorpay_subscription_id: { type: String, unique: true, index: true, sparse: true },
    status: {
      type: String,
      enum: ["created", "authenticated", "active", "pending", "halted", "cancelled", "completed", "expired"],
      default: "created",
    },
    current_period_start: { type: Date },
    current_period_end: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);
