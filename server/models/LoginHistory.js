import mongoose from "mongoose";

const loginHistorySchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: "Session" },
    method: { type: String, enum: ["password", "password_otp", "signup"], default: "password" },
    browser: { type: String },
    os: { type: String },
    deviceType: { type: String },
    ip: { type: String },
    location: { type: String },
    userAgent: { type: String },
    newDevice: { type: Boolean, default: false },
  },
  { timestamps: true }
);

loginHistorySchema.index({ createdAt: -1 });

export default mongoose.model("LoginHistory", loginHistorySchema);
