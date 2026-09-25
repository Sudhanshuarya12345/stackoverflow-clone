import mongoose from "mongoose";

const reputationTransferSchema = mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    senderBalanceAfter: { type: Number },
    receiverBalanceAfter: { type: Number },
  },
  { timestamps: true }
);

reputationTransferSchema.index({ sender: 1, createdAt: -1 });

export default mongoose.model("ReputationTransfer", reputationTransferSchema);
