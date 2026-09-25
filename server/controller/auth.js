import crypto from "crypto";
import mongoose from "mongoose";
import user from "../models/auth.js";
import bcrypt from "bcryptjs";
import { BADGES } from "../config/badges.js";
import { sendTextSms, smsSupportsText } from "../utils/sms.js";
import { sendNewDeviceLoginEmail, sendPasswordResetEmail } from "../utils/mailer.js";
import { getRequestDevice } from "../services/deviceInfo.js";
import { createSession, hasSeenDevice, isTrustedDevice, revokeUserSessions, trustDevice } from "../services/sessionService.js";
import { formatPhoneForSms, issueOtp, maskEmail, maskPhone, normalizePhone, resendOtp, verifyOtp } from "../services/otpService.js";
import { awardProfileCompletionBonus, getPrivileges, isProfileComplete } from "../services/reputationService.js";
import Session from "../models/Session.js";
import Otp from "../models/Otp.js";

const PUBLIC_USER_FIELDS =
  "name about tags joinDate plan role followersCount followingCount reputation earnedBadges badgeCounters";
const PRIVATE_USER_FIELDS = "-password -forgotPasswordDate -forgotPasswordAttempts -repTransferDate";

const getRoleForEmail = (email = "") => {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? "admin" : "user";
};

const withBadgeNames = (u) => {
  if (Array.isArray(u.earnedBadges)) {
    u.earnedBadges = u.earnedBadges.map((b) => ({ ...b, name: BADGES[b.key]?.name || b.name || "Badge" }));
  }
  return u;
};

const toSelf = (doc) => {
  const safeUser = withBadgeNames(doc.toObject ? doc.toObject() : { ...doc });
  delete safeUser.password;
  delete safeUser.forgotPasswordDate;
  delete safeUser.forgotPasswordAttempts;
  safeUser.privileges = getPrivileges(safeUser.reputation ?? 0);
  safeUser.profileComplete = isProfileComplete(safeUser);
  return safeUser;
};

const findUserByIdentifier = (identifier = "") => {
  const id = String(identifier).trim();
  const digitsOnly = normalizePhone(id);
  const query = [{ email: id.toLowerCase() }, { email: id }];
  if (digitsOnly.length >= 8) query.push({ phone: digitsOnly });
  return user.findOne({ $or: query });
};

const generateLettersOnlyPassword = (length = 10) => {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const all = upper + lower;
  const chars = [upper[crypto.randomInt(upper.length)], lower[crypto.randomInt(lower.length)]];
  for (let i = 2; i < length; i++) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const completeLogin = async (res, account, device, { method, remember }) => {
  const newDevice = !(await hasSeenDevice(account._id, device.deviceHash));
  const envRole = getRoleForEmail(account.email);
  if (envRole === "admin" && account.role !== "admin") {
    account.role = "admin";
    await account.save();
  }
  if (remember) await trustDevice(account._id, device);
  const { token } = await createSession(account, device, { method, newDevice });
  if (newDevice && method !== "signup") {
    sendNewDeviceLoginEmail(account.email, device).catch((error) => console.error("New device email failed:", error.message));
  }
  res.status(200).json({ data: toSelf(account), token });
};

export const Signup = async (req, res) => {
  const { name, password, phone } = req.body;
  const email = String(req.body.email || "").trim().toLowerCase();
  try {
    if (!name?.trim() || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    const exisitinguser = await user.findOne({ email });
    if (exisitinguser) {
      return res.status(409).json({ message: "User already exist" });
    }
    const cleanPhone = phone ? normalizePhone(phone) : "";
    if (cleanPhone) {
      const phoneExists = await user.findOne({ phone: cleanPhone });
      if (phoneExists) {
        return res.status(400).json({ message: "Phone number already registered" });
      }
    }
    const hashpassword = await bcrypt.hash(password, 12);
    // Admin role is only granted after the email address is proven via a login OTP (see completeLogin).
    const newuser = await user.create({
      name: name.trim(),
      email,
      phone: cleanPhone || undefined,
      password: hashpassword,
    });
    const device = await getRequestDevice(req);
    const { token } = await createSession(newuser, device, { method: "signup", newDevice: true });
    res.status(200).json({ data: toSelf(newuser), token });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};

export const Login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const exisitinguser = await findUserByIdentifier(email);
    if (!exisitinguser) {
      return res.status(404).json({ message: "User does not exist" });
    }
    const ispasswordcrct = await bcrypt.compare(password || "", exisitinguser.password);
    if (!ispasswordcrct) {
      return res.status(400).json({ message: "Invalid password" });
    }
    if (exisitinguser.suspended) {
      return res.status(403).json({ message: exisitinguser.suspendedReason || "Your account is suspended." });
    }

    const device = await getRequestDevice(req);
    const otpDisabled = process.env.LOGIN_OTP_ENABLED === "false";
    if (otpDisabled || (await isTrustedDevice(exisitinguser._id, device.deviceHash))) {
      return completeLogin(res, exisitinguser, device, { method: "password", remember: false });
    }

    const otp = await issueOtp(exisitinguser, {
      purpose: "login",
      channel: "email",
      meta: { deviceHash: device.deviceHash },
    });
    res.status(200).json({
      otpRequired: true,
      challengeId: otp._id,
      destination: maskEmail(exisitinguser.email),
      message: "We don't recognise this device. Enter the code we emailed you to continue.",
    });
  } catch (error) {
    console.log(error);
    res.status(error.status || 500).json({ message: error.message || "something went wrong.." });
  }
};

export const verifyLoginOtp = async (req, res) => {
  const { challengeId, code, rememberDevice } = req.body;
  try {
    if (!mongoose.Types.ObjectId.isValid(challengeId)) return res.status(400).json({ message: "Invalid verification request" });
    const device = await getRequestDevice(req);
    const otp = await verifyOtp({
      challengeId,
      purpose: "login",
      code,
      validate: (pending) => {
        if (pending.meta?.deviceHash && device.deviceHash !== pending.meta.deviceHash) {
          throw Object.assign(new Error("This code was issued for a different device."), { status: 400 });
        }
      },
    });
    const account = await user.findById(otp.user);
    if (!account) return res.status(404).json({ message: "User does not exist" });
    if (account.suspended) return res.status(403).json({ message: account.suspendedReason || "Your account is suspended." });
    await completeLogin(res, account, device, { method: "password_otp", remember: Boolean(rememberDevice) });
  } catch (error) {
    if (!error.status) console.log(error);
    res.status(error.status || 500).json({ message: error.message || "Could not verify code" });
  }
};

export const resendLoginOtp = async (req, res) => {
  try {
    const { challengeId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(challengeId)) return res.status(400).json({ message: "Invalid verification request" });
    const pending = await Otp.findById(challengeId).select("user");
    const account = pending && (await user.findById(pending.user));
    if (!account) return res.status(400).json({ message: "Verification expired. Please log in again." });
    await resendOtp(account, challengeId, "login");
    res.status(200).json({ message: "A new code has been sent." });
  } catch (error) {
    if (!error.status) console.log(error);
    res.status(error.status || 500).json({ message: error.message || "Could not resend code" });
  }
};

export const Logout = async (req, res) => {
  try {
    await Session.updateOne({ _id: req.sessionId, revokedAt: { $exists: false } }, { revokedAt: new Date(), revokedReason: "logout" });
    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not log out" });
  }
};

export const getMe = async (req, res) => {
  try {
    const me = await user.findById(req.userid);
    if (!me) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ data: toSelf(me) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load your account" });
  }
};

export const getallusers = async (req, res) => {
  try {
    const alluser = await user.find().select(PUBLIC_USER_FIELDS).lean();
    alluser.forEach(withBadgeNames);
    const planRank = { gold: 3, silver: 2, bronze: 1, free: 0 };
    alluser.sort((a, b) => (planRank[b.plan] || 0) - (planRank[a.plan] || 0) || (b.reputation || 0) - (a.reputation || 0));
    res.status(200).json({ data: alluser });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};

export const getUserProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "User unavailable" });
    const isSelf = req.userid && String(req.userid) === String(id);
    const found = await user.findById(id).select(isSelf ? PRIVATE_USER_FIELDS : PUBLIC_USER_FIELDS);
    if (!found) return res.status(404).json({ message: "User not found" });
    const data = isSelf ? toSelf(found) : withBadgeNames(found.toObject());
    data.privileges = getPrivileges(data.reputation ?? 0);
    res.status(200).json({ data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load profile" });
  }
};

export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { name, about, tags, phone } = req.body.editForm || {};
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "User unavailable" });
  }
  if (String(req.userid) !== String(_id)) {
    return res.status(403).json({ message: "You can only update your own profile" });
  }
  try {
    const updates = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Display name is required" });
      updates.name = String(name).trim();
    }
    if (about !== undefined) updates.about = String(about);
    if (Array.isArray(tags)) updates.tags = tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
    if (phone !== undefined) {
      const cleanPhone = normalizePhone(phone);
      if (cleanPhone && (cleanPhone.length < 8 || cleanPhone.length > 15)) {
        return res.status(400).json({ message: "Enter a valid mobile number" });
      }
      if (cleanPhone && (await user.exists({ phone: cleanPhone, _id: { $ne: _id } }))) {
        return res.status(400).json({ message: "Phone number already registered" });
      }
      updates.phone = cleanPhone || undefined;
    }
    const updated = await user.findByIdAndUpdate(_id, { $set: updates }, { new: true });
    const bonusAwarded = await awardProfileCompletionBonus(updated);
    const fresh = bonusAwarded ? await user.findById(_id) : updated;
    res.status(200).json({ data: toSelf(fresh), bonusAwarded });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong.." });
  }
};

export const forgotPassword = async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) {
    return res.status(400).json({ message: "Email or phone number is required" });
  }
  try {
    const account = await findUserByIdentifier(identifier);
    if (!account) {
      return res.status(404).json({ message: "User does not exist" });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const parsedLimit = parseInt(process.env.FORGOT_PASSWORD_DAILY_LIMIT, 10);
    const dailyLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1;

    let gate;
    if (account.forgotPasswordDate !== todayStr) {
      gate = await user.updateOne(
        { _id: account._id, forgotPasswordDate: { $ne: todayStr } },
        { $set: { forgotPasswordDate: todayStr, forgotPasswordAttempts: 1 } }
      );
    } else {
      gate = await user.updateOne(
        { _id: account._id, forgotPasswordDate: todayStr, forgotPasswordAttempts: { $lt: dailyLimit } },
        { $inc: { forgotPasswordAttempts: 1 } }
      );
    }
    if (gate.modifiedCount === 0) {
      const limitMsg =
        dailyLimit === 1
          ? "You can use this option only one time per day."
          : `You can use this option only ${dailyLimit} times per day.`;
      return res.status(429).json({ message: limitMsg });
    }

    const isEmailReset = String(identifier).includes("@");
    if (!isEmailReset && account.phone && !smsSupportsText()) {
      // The SMS gateway only carries numeric codes: verify the phone by SMS OTP, then reveal the new password on screen.
      try {
        const otp = await issueOtp(account, { purpose: "reset", channel: "sms" });
        return res.status(200).json({
          otpRequired: true,
          challengeId: otp._id,
          destination: maskPhone(account.phone),
          message: "We sent a verification code to your mobile number.",
        });
      } catch (smsError) {
        await user.updateOne({ _id: account._id }, { $inc: { forgotPasswordAttempts: -1 } });
        return res.status(smsError.status || 500).json({ code: smsError.code, message: smsError.message });
      }
    }

    const newPassword = generateLettersOnlyPassword(10);
    let delivered = false;
    let fallbackUsed = false;
    if (isEmailReset) {
      delivered = await sendPasswordResetEmail(account.email, newPassword);
    } else if (account.phone) {
      try {
        await sendTextSms(formatPhoneForSms(account.phone), `Your new password is: ${newPassword}`);
        delivered = true;
      } catch (smsError) {
        console.error("SMS delivery failed, falling back to email:", smsError.message);
        if (account.email) {
          fallbackUsed = true;
          delivered = await sendPasswordResetEmail(account.email, newPassword);
        }
      }
    }

    if (!delivered) {
      await user.updateOne({ _id: account._id }, { $inc: { forgotPasswordAttempts: -1 } });
      return res.status(500).json({ message: "Could not send reset password. Please try again later." });
    }

    const hashpassword = await bcrypt.hash(newPassword, 12);
    await user.updateOne({ _id: account._id }, { $set: { password: hashpassword } });
    await revokeUserSessions(account._id, "password_reset");

    res.status(200).json({
      message: fallbackUsed
        ? "SMS could not be sent, so a new password has been sent to your registered email."
        : "A new password has been sent to your registered contact.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Something went wrong. Please try again later." });
  }
};

// Second step of a phone-based reset: the SMS code proves ownership of the number, then the new password is shown.
export const verifyForgotPasswordOtp = async (req, res) => {
  const { challengeId, code } = req.body;
  try {
    if (!mongoose.Types.ObjectId.isValid(challengeId)) return res.status(400).json({ message: "Invalid verification request" });
    const otp = await verifyOtp({ challengeId, purpose: "reset", code });
    const newPassword = generateLettersOnlyPassword(10);
    const hashpassword = await bcrypt.hash(newPassword, 12);
    await user.updateOne({ _id: otp.user }, { $set: { password: hashpassword } });
    await revokeUserSessions(otp.user, "password_reset");
    res.status(200).json({ password: newPassword, message: "Your password has been reset." });
  } catch (error) {
    if (!error.status) console.error("Forgot password verify error:", error);
    res.status(error.status || 500).json({ message: error.message || "Could not verify code" });
  }
};

export const resendForgotPasswordOtp = async (req, res) => {
  try {
    const { challengeId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(challengeId)) return res.status(400).json({ message: "Invalid verification request" });
    const pending = await Otp.findById(challengeId).select("user");
    const account = pending && (await user.findById(pending.user));
    await resendOtp(account, challengeId, "reset");
    res.status(200).json({ message: "A new code has been sent." });
  } catch (error) {
    if (!error.status) console.log(error);
    res.status(error.status || 500).json({ code: error.code, message: error.message || "Could not resend code" });
  }
};
