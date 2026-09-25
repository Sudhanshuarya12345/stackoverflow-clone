import mongoose from "mongoose";

const sessionSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    tokenId: { type: String, required: true, unique: true },
    deviceHash: { type: String, index: true },
    browser: { type: String, default: "Unknown" },
    os: { type: String, default: "Unknown" },
    deviceType: { type: String, default: "desktop" },
    ip: { type: String },
    location: { type: String },
    userAgent: { type: String },
    lastActiveAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revokedReason: { type: String },
  },
  { timestamps: true }
);

sessionSchema.index({ user: 1, revokedAt: 1, lastActiveAt: -1 });

export default mongoose.model("Session", sessionSchema);
