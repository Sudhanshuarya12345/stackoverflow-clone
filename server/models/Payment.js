import mongoose from "mongoose";

const paymentSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    razorpay_payment_id: { type: String, unique: true, sparse: true },
    amount: { type: Number, required: true }, // in paise
    status: { type: String, enum: ["captured", "failed", "refunded"] },
    invoice_number: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
