import mongoose from "mongoose";

const followSchema = mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    following: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
  },
  { timestamps: true }
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });

export default mongoose.model("Follow", followSchema);
