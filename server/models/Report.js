import mongoose from "mongoose";

const reportSchema = mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityPost", required: true, index: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    reason: { type: String, required: true },
    details: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "dismissed", "removed"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

reportSchema.index({ postId: 1, reporterId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Report", reportSchema);
