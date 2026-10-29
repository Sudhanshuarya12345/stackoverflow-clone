import mongoose from "mongoose";

const reputationTransferSchema = mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    senderBalanceAfter: { type: Number },
    receiverBalanceAfter: { type: Number },
    // Client-generated id of the submission; a retry with the same id returns this transfer instead of a new one.
    requestId: { type: String },
  },
  { timestamps: true }
);

reputationTransferSchema.index({ sender: 1, createdAt: -1 });
reputationTransferSchema.index({ sender: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: "string" } } });

export default mongoose.model("ReputationTransfer", reputationTransferSchema);
