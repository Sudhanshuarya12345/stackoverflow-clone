import mongoose from "mongoose";

const paymentSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    razorpay_payment_id: { type: String, unique: true, sparse: true },
    razorpay_event_id: { type: String },
    provider: { type: String, enum: ["razorpay"], default: "razorpay" },
    plan: { type: String, enum: ["bronze", "silver", "gold"] },
    amount: { type: Number, required: true }, // in paise
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "captured", "failed"] },
    payment_method: { type: String },
    billing_period_start: { type: Date },
    billing_period_end: { type: Date },
    transaction_id: { type: String },
    tax_amount: { type: Number, default: 0 },
    invoice_number: { type: String, unique: true, sparse: true },
    invoice_email_sent_at: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
