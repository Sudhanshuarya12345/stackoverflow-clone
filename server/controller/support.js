import SupportTicket from "../models/SupportTicket.js";
import { refreshUserPlanFromSubscription, userMeetsPlan } from "../services/subscriptionAccess.js";

export const createSupportTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const { plan } = await refreshUserPlanFromSubscription(req.userid);
    const hasSilver = await userMeetsPlan(req.userid, "silver");
    const hasGold = await userMeetsPlan(req.userid, "gold");

    const priority = hasGold ? "highest" : hasSilver ? "priority" : "standard";

    const ticket = await SupportTicket.create({
      userId: req.userid,
      subject: subject.trim(),
      message: message.trim(),
      plan,
      priority,
    });

    res.status(201).json({ data: ticket });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not create support ticket" });
  }
};

export const getMySupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.userid }).sort({ createdAt: -1 });
    res.status(200).json({ data: tickets });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not fetch support tickets" });
  }
};

export const getSupportInfo = async (req, res) => {
  try {
    const hasSilver = await userMeetsPlan(req.userid, "silver");
    const hasGold = await userMeetsPlan(req.userid, "gold");
    res.status(200).json({
      priority: hasGold ? "highest" : hasSilver ? "priority" : "standard",
      message: hasGold
        ? "Gold members get highest-priority customer support."
        : hasSilver
          ? "Silver members get priority support."
          : "You are on the Free plan. Priority support requires Silver or Gold.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not fetch support info" });
  }
};