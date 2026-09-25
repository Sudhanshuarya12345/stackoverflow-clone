import crypto from "crypto";
import mongoose from "mongoose";
import Otp from "../models/Otp.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { sendOtpSms } from "../utils/sms.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const hashCode = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

export const normalizePhone = (value = "") => String(value).replace(/[^\d]/g, "");

export const formatPhoneForSms = (value = "") => {
  const digitsOnly = normalizePhone(value);
  if (!digitsOnly) return "";
  if (String(value).trim().startsWith("+")) return `+${digitsOnly}`;
  if (digitsOnly.length === 10) return `+${process.env.DEFAULT_PHONE_COUNTRY_CODE || "91"}${digitsOnly}`;
  return `+${digitsOnly}`;
};

export const maskEmail = (email = "") => {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
};

export const maskPhone = (phone = "") => {
  const digits = normalizePhone(phone);
  return digits ? `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : "";
};

const deliver = async (user, channel, code, purpose) => {
  if (channel === "email") {
    const sent = await sendOtpEmail(user.email, code, purpose);
    if (!sent) throw new Error("Could not send the verification email. Please try again later.");
    return;
  }
  const purposeText =
    purpose === "language" ? "confirm your language change" : purpose === "reset" ? "reset your password" : "verify your login";
  try {
    await sendOtpSms(formatPhoneForSms(user.phone), code, `Your verification code is ${code}. Use it to ${purposeText}. It expires in 10 minutes.`);
  } catch (error) {
    // Keep provider details (e.g. Twilio 20003) in the server log; show the user something actionable.
    console.error(`SMS OTP delivery failed (${error.code || "no code"}): ${error.message}`);
    throw Object.assign(new Error("We couldn't send the SMS verification code to your mobile number. Please try again later."), {
      status: 503,
      code: "SMS_FAILED",
    });
  }
};

const sendWithDevFallback = async (user, channel, code, purpose) => {
  try {
    await deliver(user, channel, code, purpose);
  } catch (error) {
    // Local development without SMTP/Twilio credentials: print the code instead of failing.
    if (process.env.NODE_ENV !== "production" && process.env.OTP_DEV_LOG === "true") {
      console.log(`[OTP dev] ${purpose} code for ${user.email} via ${channel}: ${code}`);
      return;
    }
    throw error;
  }
};

export const issueOtp = async (user, { purpose, channel, meta = {} }) => {
  const code = generateCode();
  const otp = await Otp.create({
    user: user._id,
    purpose,
    channel,
    codeHash: hashCode(code),
    meta,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  try {
    await sendWithDevFallback(user, channel, code, purpose);
  } catch (error) {
    await Otp.deleteOne({ _id: otp._id });
    throw error;
  }
  return otp;
};

export const resendOtp = async (user, challengeId, purpose) => {
  if (!user || !mongoose.Types.ObjectId.isValid(challengeId)) throw Object.assign(new Error("Verification expired. Please start again."), { status: 400 });
  const otp = await Otp.findOne({ _id: challengeId, user: user._id, purpose, consumedAt: { $exists: false } });
  if (!otp || otp.expiresAt <= new Date()) throw Object.assign(new Error("Verification expired. Please start again."), { status: 400 });
  if (Date.now() - otp.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw Object.assign(new Error("Please wait a minute before requesting another code."), { status: 429 });
  }
  const code = generateCode();
  otp.codeHash = hashCode(code);
  otp.attempts = 0;
  otp.lastSentAt = new Date();
  otp.expiresAt = new Date(Date.now() + OTP_TTL_MS);
  await otp.save();
  await sendWithDevFallback(user, otp.channel, code, purpose);
  return otp;
};

// Consumes the OTP on success. Throws an Error with .status on failure.
// `validate(otp)` may throw to reject the attempt before the code is checked or consumed.
export const verifyOtp = async ({ challengeId, purpose, code, userId, validate }) => {
  const filter = { _id: challengeId, purpose, consumedAt: { $exists: false } };
  if (userId) filter.user = userId;
  const otp = await Otp.findOne(filter);
  if (!otp || otp.expiresAt <= new Date()) throw Object.assign(new Error("Verification code expired. Please request a new one."), { status: 400 });
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw Object.assign(new Error("Too many incorrect attempts. Please request a new code."), { status: 429 });
  if (validate) validate(otp);

  const expected = Buffer.from(otp.codeHash, "hex");
  const received = Buffer.from(hashCode(String(code || "").trim()), "hex");
  if (!crypto.timingSafeEqual(expected, received)) {
    await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
    throw Object.assign(new Error("Incorrect verification code."), { status: 400 });
  }
  const consumed = await Otp.findOneAndUpdate(
    { _id: otp._id, consumedAt: { $exists: false } },
    { consumedAt: new Date() },
    { new: true }
  );
  if (!consumed) throw Object.assign(new Error("This code was already used."), { status: 400 });
  return consumed;
};
