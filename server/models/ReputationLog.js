import mongoose from "mongoose";

const reputationLogSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    delta: { type: Number, required: true },
    type: { type: String, required: true },
    reason: { type: String, required: true },
    // Translation key (under "repDetail." in the frontend locales) and values for rendering `reason` in the
    // viewer's language. `reason` keeps the English text for older clients and logs.
    detailKey: { type: String },
    detailVars: { type: mongoose.Schema.Types.Mixed },
    // Free text supplied by a member (e.g. a transfer reason), shown verbatim in every language.
    note: { type: String },
    balanceAfter: { type: Number },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    questionId: { type: String },
    answerId: { type: String },
    postId: { type: String },
    transferId: { type: mongoose.Schema.Types.ObjectId, ref: "ReputationTransfer" },
  },
  { timestamps: true }
);

reputationLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("ReputationLog", reputationLogSchema);
