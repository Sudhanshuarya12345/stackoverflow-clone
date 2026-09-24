import mongoose from "mongoose";
import user from "../models/auth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { BADGES } from "../config/badges.js";
import { sendSms } from "../utils/twilioSms.js";
import { sendPasswordResetEmail } from "../utils/mailer.js";

const getRoleForEmail = (email = "") => {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase()) ? "admin" : "user";
};

const normalizePhone = (value = "") => String(value).replace(/[^\d]/g, "");

const formatPhoneForSms = (value = "") => {
  const digitsOnly = normalizePhone(value);
  if (!digitsOnly) return "";
  if (String(value).trim().startsWith("+")) return `+${digitsOnly}`;
  if (digitsOnly.length === 10) {
    return `+${process.env.DEFAULT_PHONE_COUNTRY_CODE || "91"}${digitsOnly}`;
  }
  return `+${digitsOnly}`;
};

const findUserByIdentifier = (identifier = "") => {
  const id = String(identifier).trim();
  const digitsOnly = normalizePhone(id);
  const query = [{ email: id }];
  if (digitsOnly.length >= 8) query.push({ phone: digitsOnly });
  return user.findOne({ $or: query });
};

const generateLettersOnlyPassword = (length = 10) => {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const all = upper + lower;
  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
  ];
  for (let i = 2; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

export const Signup = async (req, res) => {
  const { name, email, password, phone } = req.body;
  try {
    const exisitinguser = await user.findOne({ email });
    if (exisitinguser) {
      return res.status(404).json({ message: "User already exist" });
    }
    const cleanPhone = phone ? normalizePhone(phone) : "";
    if (cleanPhone) {
      const phoneExists = await user.findOne({ phone: cleanPhone });
      if (phoneExists) {
        return res.status(400).json({ message: "Phone number already registered" });
      }
    }
    const hashpassword = await bcrypt.hash(password, 12);
    const newuser = await user.create({
      name,
      email,
      phone: cleanPhone || undefined,
      password: hashpassword,
      role: getRoleForEmail(email),
    });
    const token = jwt.sign(
      { email: newuser.email, id: newuser._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const safeUser = newuser.toObject();
    delete safeUser.password;
    res.status(200).json({ data: safeUser, token });
  } catch (error) {
    res.status(500).json("something went wrong..");
    return;
  }
};
export const Login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const exisitinguser = await findUserByIdentifier(email);
    if (!exisitinguser) {
      return res.status(404).json({ message: "User does not exist" });
    }

    const ispasswordcrct = await bcrypt.compare(
      password,
      exisitinguser.password
    );
    if (!ispasswordcrct) {
      return res.status(400).json({ message: "Invalid password" });
    }
    if (exisitinguser.suspended) {
      return res.status(403).json({ message: exisitinguser.suspendedReason || "Your account is suspended." });
    }
    const envRole = getRoleForEmail(exisitinguser.email);
    if (envRole === "admin" && exisitinguser.role !== "admin") {
      exisitinguser.role = "admin";
      await exisitinguser.save();
    }
    const token = jwt.sign(
      { email: exisitinguser.email, id: exisitinguser._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const safeUser = exisitinguser.toObject();
    delete safeUser.password;
    res.status(200).json({ data: safeUser, token });
  } catch (error) {
    res.status(500).json("something went wrong..");
    return;
  }
};
export const getallusers = async (req, res) => {
  try {
    const alluser = await user.find().select("-password").lean();
    alluser.forEach((u) => {
      if (Array.isArray(u.earnedBadges)) {
        u.earnedBadges = u.earnedBadges.map((b) => ({
          ...b,
          name: BADGES[b.key]?.name || b.name || "Badge",
        }));
      }
    });
    const planRank = { gold: 3, silver: 2, bronze: 1, free: 0 };
    alluser.sort((a, b) => (planRank[b.plan] || 0) - (planRank[a.plan] || 0));
    res.status(200).json({ data: alluser });
  } catch (error) {
    res.status(500).json("something went wrong..");
    return;
  }
};
export const updateprofile = async (req, res) => {
  const { id: _id } = req.params;
  const { name, about, tags } = req.body.editForm;
  if (!mongoose.Types.ObjectId.isValid(_id)) {
    return res.status(400).json({ message: "User unavailable" });
  }
  if (String(req.userid) !== String(_id)) {
    return res.status(403).json({ message: "You can only update your own profile" });
  }
  try {
    const updateprofile = await user.findByIdAndUpdate(
      _id,
      { $set: { name: name, about: about, tags: tags } },
      { new: true }
    );
    const safeUser = updateprofile.toObject();
    delete safeUser.password;
    res.status(200).json({ data: safeUser });
  } catch (error) {
    console.log(error);
    res.status(500).json("something went wrong..");
    return;
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
        { _id: account._id },
        { $set: { forgotPasswordDate: todayStr, forgotPasswordAttempts: 1 } }
      );
    } else {
      gate = await user.updateOne(
        { _id: account._id, forgotPasswordAttempts: { $lt: dailyLimit } },
        { $inc: { forgotPasswordAttempts: 1 } }
      );
    }
    if (gate.modifiedCount === 0) {
      const limitMsg =
        dailyLimit === 1
          ? "You can use this option only one time per day."
          : `You can use this option only ${dailyLimit} times per day.`;
      return res.status(400).json({ message: limitMsg });
    }

    const newPassword = generateLettersOnlyPassword(10);
    const isEmailReset = String(identifier).includes("@");
    let delivered = false;
    let fallbackUsed = false;
    if (isEmailReset) {
      delivered = await sendPasswordResetEmail(account.email, newPassword);
    } else if (account.phone) {
      try {
        await sendSms(formatPhoneForSms(account.phone), `Your new password is: ${newPassword}`);
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
      await user.updateOne(
        { _id: account._id },
        { $inc: { forgotPasswordAttempts: -1 } }
      );
      return res.status(500).json({ message: "Could not send reset password. Please try again later." });
    }

    const hashpassword = await bcrypt.hash(newPassword, 12);
    await user.updateOne({ _id: account._id }, { $set: { password: hashpassword } });

    if (process.env.NODE_ENV !== "production") {
      console.log("Generated reset password (dev only):", newPassword);
    }

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
