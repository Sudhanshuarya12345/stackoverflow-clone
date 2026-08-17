import mongoose from "mongoose";

const notificationSchema = mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    type: {
      type: String,
      enum: ["like", "comment", "reply", "mention", "follow", "share"],
      required: true,
    },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "CommunityPost" },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
