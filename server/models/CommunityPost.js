import mongoose from "mongoose";

const replySchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const commentSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    body: { type: String, required: true },
    replies: { type: [replySchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const imageSchema = mongoose.Schema(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false }
);

const communityPostSchema = mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    content: { type: String, default: "" },
    type: {
      type: String,
      enum: ["update", "showcase", "project", "achievement", "snippet"],
      default: "update",
    },
    images: { type: [imageSchema], default: [] },
    code: {
      language: { type: String, default: "text" },
      code: { type: String, default: "" },
    },
    hashtags: { type: [String], default: [], index: true },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    comments: { type: [commentSchema], default: [] },
    shares: { type: Number, default: 0 },
    reportsCount: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0, index: true },
    status: { type: String, enum: ["active", "removed"], default: "active", index: true },
  },
  { timestamps: true }
);

communityPostSchema.index({ content: "text", hashtags: "text" });
communityPostSchema.index({ status: 1, createdAt: -1 });
communityPostSchema.index({ status: 1, hashtags: 1, createdAt: -1 });

export default mongoose.model("CommunityPost", communityPostSchema);
