import mongoose from "mongoose";

const supportTicketSchema = mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true, index: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    plan: { type: String, enum: ["free", "bronze", "silver", "gold"], default: "free" },
    priority: {
      type: String,
      enum: ["standard", "priority", "highest"],
      default: "standard",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },
    adminNote: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("SupportTicket", supportTicketSchema);