import mongoose from "mongoose";
import User from "../models/auth.js";
import ReputationLog from "../models/ReputationLog.js";
import ReputationTransfer from "../models/ReputationTransfer.js";
import { todayKey } from "../utils/day.js";
import { PRIVILEGES, REPUTATION_RULES, TRANSFER_RULES, changeReputation } from "../services/reputationService.js";
import { abortWith } from "../services/transaction.js";

const RECIPIENT_UNAVAILABLE = "This member can't receive reputation right now";

const sentTodayOf = (user, todayStr = todayKey()) => (user?.repTransferDate === todayStr ? user.repTransferredToday || 0 : 0);

// A retried submission (same requestId) gets the transfer it already made instead of sending the points twice.
// Returns true when the response has been sent.
const replayTransfer = async (res, senderId, requestId, { receiverId, amount }) => {
  const existing = await ReputationTransfer.findOne({ sender: senderId, requestId });
  if (!existing) return false;
  if (String(existing.receiver) !== String(receiverId) || existing.amount !== amount) {
    res.status(409).json({ message: "This transfer request was already used for a different transfer" });
    return true;
  }
  const me = await User.findById(senderId).select("reputation repTransferDate repTransferredToday");
  res.status(200).json({
    data: existing,
    reputation: me?.reputation,
    remainingToday: Math.max(0, TRANSFER_RULES.maxPerDay - sentTodayOf(me)),
    duplicate: true,
  });
  return true;
};

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
    const todayStr = todayKey();
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
  const requestId = req.body.requestId === undefined || req.body.requestId === null ? undefined : String(req.body.requestId);
  try {
    if (!mongoose.Types.ObjectId.isValid(receiverId)) return res.status(400).json({ message: "Choose a valid recipient" });
    if (String(receiverId) === String(req.userid)) return res.status(400).json({ message: "You cannot transfer reputation to yourself" });
    if (!Number.isInteger(amount) || amount < 1) return res.status(400).json({ message: "Amount must be a whole number of at least 1" });
    if (amount > TRANSFER_RULES.maxPerTransaction) {
      return res.status(400).json({ message: `You can transfer at most ${TRANSFER_RULES.maxPerTransaction} points per transaction` });
    }
    if (reason.length < 3 || reason.length > 200) return res.status(400).json({ message: "Give a reason between 3 and 200 characters" });
    if (requestId !== undefined && !/^[\w-]{8,64}$/.test(requestId)) return res.status(400).json({ message: "Invalid transfer request" });
    if (requestId && (await replayTransfer(res, req.userid, requestId, { receiverId, amount }))) return;

    const receiver = await User.findById(receiverId).select("name suspended");
    if (!receiver) return res.status(404).json({ message: "Recipient not found" });
    // Suspension is the penalty for guideline violations, so suspended members cannot be rewarded.
    if (receiver.suspended) return res.status(400).json({ message: RECIPIENT_UNAVAILABLE });

    const sender = await User.findById(req.userid).select("reputation repTransferDate repTransferredToday");
    if (!sender) return res.status(404).json({ message: "User not found" });
    if ((sender.reputation ?? 0) <= TRANSFER_RULES.minBalance) {
      return res.status(400).json({ message: `You need more than ${TRANSFER_RULES.minBalance} reputation to transfer points` });
    }
    if (amount > sender.reputation) return res.status(400).json({ message: "You don't have enough reputation for this transfer" });

    // Sender debit, recipient credit, the transfer record and both history entries commit together or not at all.
    // withTransaction retries the whole block on transient errors (e.g. two transfers racing on the same sender).
    const todayStr = todayKey();
    const sentToday = { $cond: [{ $eq: ["$repTransferDate", todayStr] }, { $ifNull: ["$repTransferredToday", 0] }, 0] };
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        result = null;
        // Debit the sender and reserve today's allowance in one conditional update.
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
          { new: true, session }
        );
        if (!debited) {
          result = { notDebited: true };
          return;
        }

        // Re-checked inside the transaction so a suspension or deletion during the request rolls back the debit.
        const target = await User.findById(receiverId).select("suspended").session(session);
        if (!target) throw abortWith(404, "Recipient not found");
        if (target.suspended) throw abortWith(400, RECIPIENT_UNAVAILABLE);

        // Credit the recipient and write their history entry.
        const transferId = new mongoose.Types.ObjectId();
        const receiverBalance = await changeReputation(receiverId, amount, {
          type: "transfer_received",
          reason: `Received from a community member: ${reason}`,
          detail: { key: "transferReceived" },
          note: reason,
          actor: req.userid,
          transferId,
          session,
        });
        // Receiver vanished between checks: aborting the transaction rolls back the debit.
        if (receiverBalance === null) throw Object.assign(new Error("Recipient not found"), { status: 404 });

        const [transfer] = await ReputationTransfer.create(
          [
            {
              _id: transferId,
              sender: req.userid,
              receiver: receiverId,
              amount,
              reason,
              senderBalanceAfter: debited.reputation,
              receiverBalanceAfter: receiverBalance,
              requestId,
            },
          ],
          { session }
        );
        await ReputationLog.create(
          [
            {
              user: req.userid,
              delta: -amount,
              type: "transfer_sent",
              reason: `Sent to ${receiver.name}: ${reason}`,
              detailKey: "transferSent",
              detailVars: { name: receiver.name },
              note: reason,
              balanceAfter: debited.reputation,
              actor: req.userid,
              transferId: transfer._id,
            },
          ],
          { session }
        );
        result = { transfer, debited };
      });
    } finally {
      await session.endSession();
    }

    if (result.notDebited) {
      // The conditional debit failed: report the actual reason from the sender's current state, which another
      // request may have changed since the checks above.
      const current = await User.findById(req.userid).select("reputation repTransferDate repTransferredToday");
      const balance = current?.reputation ?? 0;
      if (balance <= TRANSFER_RULES.minBalance) {
        return res.status(400).json({ message: `You need more than ${TRANSFER_RULES.minBalance} reputation to transfer points` });
      }
      if (amount > balance) return res.status(400).json({ message: "You don't have enough reputation for this transfer" });
      const used = sentTodayOf(current, todayStr);
      if (used + amount > TRANSFER_RULES.maxPerDay) {
        return res.status(400).json({
          message: `Daily transfer limit is ${TRANSFER_RULES.maxPerDay} points. You can still send ${Math.max(0, TRANSFER_RULES.maxPerDay - used)} today.`,
        });
      }
      return res.status(409).json({ message: "The transfer could not be completed. Please try again." });
    }
    const { transfer, debited } = result;
    res.status(201).json({ data: transfer, reputation: debited.reputation, remainingToday: TRANSFER_RULES.maxPerDay - debited.repTransferredToday });
  } catch (error) {
    // Two submissions with the same requestId raced: the other one committed, so answer with its transfer.
    if (error.code === 11000 && requestId && (await replayTransfer(res, req.userid, requestId, { receiverId, amount }).catch(() => false))) return;
    if (error.aborted || error.status === 404) return res.status(error.status).json({ message: error.message });
    console.log(error);
    res.status(500).json({ message: "Could not transfer reputation" });
  }
};
