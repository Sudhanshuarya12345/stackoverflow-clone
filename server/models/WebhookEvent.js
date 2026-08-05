import mongoose from "mongoose";

const webhookEventSchema = mongoose.Schema(
  {
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("WebhookEvent", webhookEventSchema);
