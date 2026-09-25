import mongoose from "mongoose";

const trustedDeviceSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    deviceHash: { type: String, required: true },
    label: { type: String },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

trustedDeviceSchema.index({ user: 1, deviceHash: 1 }, { unique: true });
trustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("TrustedDevice", trustedDeviceSchema);
