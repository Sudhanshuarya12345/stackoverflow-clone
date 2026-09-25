import mongoose from "mongoose";
import User from "../models/auth.js";
import ReputationLog from "../models/ReputationLog.js";
import ReputationTransfer from "../models/ReputationTransfer.js";
import { PRIVILEGES, REPUTATION_RULES, TRANSFER_RULES, changeReputation } from "../services/reputationService.js";

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

export const getReputationRules = (req, res) => {
  res.status(200).json({ rules: REPUTATION_RULES, privileges: PRIVILEGES, transfer: TRANSFER_RULES });
};

export const getReputationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "User unavailable" });
    const { page, limit, skip } = getPagination(req.query);
    const filter = { user: id };
    const [data, total, owner] = await Promise.all([
      ReputationLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("actor", "name").lean(),
      ReputationLog.countDocuments(filter),
      User.findById(id).select("reputation"),
    ]);
    if (!owner) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit), reputation: owner.reputation });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load reputation history" });
  }
};

export const getMyTransfers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { $or: [{ sender: req.userid }, { receiver: req.userid }] };
    const todayStr = new Date().toISOString().split("T")[0];
    const [data, total, me] = await Promise.all([
      ReputationTransfer.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name")
        .populate("receiver", "name")
        .lean(),
      ReputationTransfer.countDocuments(filter),
      User.findById(req.userid).select("reputation repTransferDate repTransferredToday"),
    ]);
    const sentToday = me?.repTransferDate === todayStr ? me.repTransferredToday || 0 : 0;
    res.status(200).json({
      data: data.map((t) => ({ ...t, direction: String(t.sender?._id) === String(req.userid) ? "sent" : "received" })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      sentToday,
      remainingToday: Math.max(0, TRANSFER_RULES.maxPerDay - sentToday),
      rules: TRANSFER_RULES,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load transfers" });
  }
};

export const transferReputation = async (req, res) => {
  const { receiverId } = req.body;
  const amount = Number(req.body.amount);
  const reason = String(req.body.reason || "").trim();
  try {
    if (!mongoose.Types.ObjectId.isValid(receiverId)) return res.status(400).json({ message: "Choose a valid recipient" });
    if (String(receiverId) === String(req.userid)) return res.status(400).json({ message: "You cannot transfer reputation to yourself" });
    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ message: "Amount must be a whole number of at least 1" });
    if (amount > TRANSFER_RULES.maxPerTransaction) {
      return res.status(400).json({ message: `You can transfer at most ${TRANSFER_RULES.maxPerTransaction} points per transaction` });
    }
    if (reason.length < 3 || reason.length > 200) return res.status(400).json({ message: "Give a reason between 3 and 200 characters" });

    const receiver = await User.findById(receiverId).select("name suspended");
    if (!receiver) return res.status(404).json({ message: "Recipient not found" });

    const sender = await User.findById(req.userid).select("reputation repTransferDate repTransferredToday");
    if (!sender) return res.status(404).json({ message: "User not found" });
    if ((sender.reputation ?? 0) <= TRANSFER_RULES.minBalance) {
      return res.status(400).json({ message: `You need more than ${TRANSFER_RULES.minBalance} reputation to transfer points` });
    }
    if (amount > sender.reputation) return res.status(400).json({ message: "You don't have enough reputation for this transfer" });

    // Debit the sender and reserve today's allowance in one atomic, conditional update.
    const todayStr = new Date().toISOString().split("T")[0];
    const sentToday = { $cond: [{ $eq: ["$repTransferDate", todayStr] }, { $ifNull: ["$repTransferredToday", 0] }, 0] };
    const debited = await User.findOneAndUpdate(
      {
        _id: req.userid,
        reputation: { $gt: TRANSFER_RULES.minBalance, $gte: amount },
        $expr: { $lte: [{ $add: [sentToday, amount] }, TRANSFER_RULES.maxPerDay] },
      },
      [
        {
          $set: {
            reputation: { $subtract: ["$reputation", amount] },
            repTransferredToday: { $add: [sentToday, amount] },
            repTransferDate: todayStr,
          },
        },
      ],
      { new: true }
    );
    if (!debited) {
      const used = sender.repTransferDate === todayStr ? sender.repTransferredToday || 0 : 0;
      return res.status(400).json({
        message: `Daily transfer limit is ${TRANSFER_RULES.maxPerDay} points. You can still send ${Math.max(0, TRANSFER_RULES.maxPerDay - used)} today.`,
      });
    }

    const transfer = await ReputationTransfer.create({
      sender: req.userid,
      receiver: receiverId,
      amount,
      reason,
      senderBalanceAfter: debited.reputation,
    });
    const receiverBalance = await changeReputation(receiverId, amount, {
      type: "transfer_received",
      reason: `Received from a community member: ${reason}`,
      note: reason,
      actor: req.userid,
      transferId: transfer._id,
    });
    if (receiverBalance === null) {
      // Receiver vanished between checks: refund the sender.
      await User.updateOne({ _id: req.userid }, { $inc: { reputation: amount, repTransferredToday: -amount } });
      await ReputationTransfer.deleteOne({ _id: transfer._id });
      return res.status(404).json({ message: "Recipient not found" });
    }
    transfer.receiverBalanceAfter = receiverBalance;
    await transfer.save();
    await ReputationLog.create({
      user: req.userid,
      delta: -amount,
      type: "transfer_sent",
      reason: `Sent to ${receiver.name}: ${reason}`,
      note: reason,
      balanceAfter: debited.reputation,
      actor: req.userid,
      transferId: transfer._id,
    });

    res.status(201).json({ data: transfer, reputation: debited.reputation, remainingToday: TRANSFER_RULES.maxPerDay - debited.repTransferredToday });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not transfer reputation" });
  }
};
