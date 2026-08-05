import mongoose from "mongoose";

const subscriptionSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    plan: { type: String, enum: ["free", "bronze", "silver", "gold"], required: true },
    razorpay_subscription_id: { type: String, unique: true, index: true, sparse: true },
    status: {
      type: String,
      enum: ["created", "authenticated", "active", "pending", "halted", "cancelled", "cancellation_pending", "completed", "expired"],
      default: "created",
    },
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    current_period_start: { type: Date },
    current_period_end: { type: Date },
    cancel_at_period_end: { type: Boolean, default: false },
    cancelled_at: { type: Date },
  },
  { timestamps: true }
);

subscriptionSchema.index(
  { userId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["created", "authenticated", "active", "pending", "cancellation_pending"] } } }
);

export default mongoose.model("Subscription", subscriptionSchema);
