import mongoose from "mongoose";
import User from "../models/auth.js";
import Session from "../models/Session.js";
import LoginHistory from "../models/LoginHistory.js";
import TrustedDevice from "../models/TrustedDevice.js";
import { SESSION_INACTIVITY_MS, revokeUserSessions } from "../services/sessionService.js";
import { issueOtp, maskEmail, maskPhone, resendOtp, verifyOtp } from "../services/otpService.js";

const SUPPORTED_LANGUAGES = ["en", "es", "hi", "pt", "zh", "fr"];

const getPagination = (query, max = 50) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(max, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const activeSessionFilter = (userId) => ({
  user: userId,
  revokedAt: { $exists: false },
  expiresAt: { $gt: new Date() },
  lastActiveAt: { $gt: new Date(Date.now() - SESSION_INACTIVITY_MS()) },
});

export const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find(activeSessionFilter(req.userid))
      .select("-tokenId -deviceHash")
      .sort({ lastActiveAt: -1 })
      .lean();
    res.status(200).json({
      data: sessions.map((s) => ({ ...s, current: String(s._id) === String(req.sessionId) })),
      inactivityMinutes: Math.round(SESSION_INACTIVITY_MS() / 60000),
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load sessions" });
  }
};

export const revokeSession = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Session unavailable" });
    const result = await Session.updateOne(
      { _id: req.params.id, user: req.userid, revokedAt: { $exists: false } },
      { revokedAt: new Date(), revokedReason: "revoked_by_user" }
    );
    if (!result.modifiedCount) return res.status(404).json({ message: "Session not found" });
    res.status(200).json({ message: "Session revoked", current: String(req.params.id) === String(req.sessionId) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not revoke session" });
  }
};

export const revokeOtherSessions = async (req, res) => {
  try {
    const count = await revokeUserSessions(req.userid, "revoked_by_user", req.sessionId);
    res.status(200).json({ message: `Signed out of ${count} other session(s)`, count });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not revoke sessions" });
  }
};

export const getTrustedDevices = async (req, res) => {
  try {
    const devices = await TrustedDevice.find({ user: req.userid, expiresAt: { $gt: new Date() } })
      .select("-deviceHash")
      .sort({ lastUsedAt: -1 })
      .lean();
    res.status(200).json({ data: devices });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load trusted devices" });
  }
};

export const removeTrustedDevice = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: "Device unavailable" });
    const result = await TrustedDevice.deleteOne({ _id: req.params.id, user: req.userid });
    if (!result.deletedCount) return res.status(404).json({ message: "Device not found" });
    res.status(200).json({ message: "Device removed. It will need a verification code next time." });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not remove device" });
  }
};

export const getMyLoginHistory = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { user: req.userid };
    const [data, total] = await Promise.all([
      LoginHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      LoginHistory.countDocuments(filter),
    ]);
    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load login history" });
  }
};

export const getLoginActivity = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query, 100);
    const filter = {};
    if (req.query.email) {
      const found = await User.find({ email: { $regex: String(req.query.email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }).select("_id");
      filter.user = { $in: found.map((u) => u._id) };
    }
    if (req.query.newDevice === "true") filter.newDevice = true;
    const [data, total] = await Promise.all([
      LoginHistory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", "name email role").lean(),
      LoginHistory.countDocuments(filter),
    ]);
    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load login activity" });
  }
};

// Language switching: French is verified by email OTP, every other language by SMS OTP.
export const requestLanguageChange = async (req, res) => {
  try {
    const { language } = req.body;
    if (!SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ message: "Unsupported language" });
    const me = await User.findById(req.userid);
    if (!me) return res.status(404).json({ message: "User not found" });
    if (me.language === language) return res.status(200).json({ changed: false, language });

    const channel = language === "fr" ? "email" : "sms";
    if (channel === "sms" && !me.phone) {
      return res.status(400).json({
        code: "PHONE_REQUIRED",
        message: "Add a mobile number to your profile to switch to this language.",
      });
    }
    const otp = await issueOtp(me, { purpose: "language", channel, meta: { language } });
    res.status(200).json({
      otpRequired: true,
      challengeId: otp._id,
      channel,
      destination: channel === "email" ? maskEmail(me.email) : maskPhone(me.phone),
    });
  } catch (error) {
    console.log(error);
    res.status(error.status || 500).json({ code: error.code, message: error.message || "Could not send verification code" });
  }
};

export const verifyLanguageChange = async (req, res) => {
  try {
    const { challengeId, code } = req.body;
    if (!mongoose.Types.ObjectId.isValid(challengeId)) return res.status(400).json({ message: "Invalid verification request" });
    const otp = await verifyOtp({ challengeId, purpose: "language", code, userId: req.userid });
    const language = otp.meta?.language;
    if (!SUPPORTED_LANGUAGES.includes(language)) return res.status(400).json({ message: "Unsupported language" });
    await User.updateOne({ _id: req.userid }, { language });
    res.status(200).json({ changed: true, language });
  } catch (error) {
    if (!error.status) console.log(error);
    res.status(error.status || 500).json({ message: error.message || "Could not verify code" });
  }
};

export const resendLanguageOtp = async (req, res) => {
  try {
    const me = await User.findById(req.userid);
    await resendOtp(me, req.body.challengeId, "language");
    res.status(200).json({ message: "A new code has been sent." });
  } catch (error) {
    if (!error.status) console.log(error);
    res.status(error.status || 500).json({ message: error.message || "Could not resend code" });
  }
};
