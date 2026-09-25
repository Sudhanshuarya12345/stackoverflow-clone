import { sendSms as sendTwilioSms } from "./twilioSms.js";

// SMS_PROVIDER selects the gateway: "twilio" (default) or "2factor" (2factor.in, free trial credits, India OTP without DLT).
const provider = () => (process.env.SMS_PROVIDER || "twilio").toLowerCase();

const send2FactorOtp = async (phone, code) => {
  const apiKey = process.env.TWOFACTOR_API_KEY;
  if (!apiKey) throw new Error("2Factor is not configured (TWOFACTOR_API_KEY missing)");
  const digits = String(phone).replace(/[^\d]/g, "");
  // 2Factor's OTP route delivers a numeric code we generate, using its pre-approved OTP template.
  const template = process.env.TWOFACTOR_TEMPLATE ? `/${encodeURIComponent(process.env.TWOFACTOR_TEMPLATE)}` : "";
  const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/+${digits}/${encodeURIComponent(code)}${template}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.Status !== "Success") {
    throw Object.assign(new Error(`2Factor: ${data.Details || res.statusText}`), { code: "2FACTOR_ERROR" });
  }
  console.log("OTP SMS sent via 2Factor:", data.Details);
  return data;
};

// Whether the configured provider can deliver free-form text (like a generated password) by SMS.
export const smsSupportsText = () => provider() !== "2factor";

// Sends a numeric one-time code. `text` is the full message for providers that allow free-form SMS.
export const sendOtpSms = async (phone, code, text) => {
  if (provider() === "2factor") return send2FactorOtp(phone, code);
  return sendTwilioSms(phone, text);
};

// Free-form SMS (e.g. a new password). 2Factor's free OTP route can't carry custom text, so callers fall back to email.
export const sendTextSms = async (phone, text) => {
  if (provider() === "2factor") {
    throw new Error("The configured SMS provider (2Factor OTP route) only delivers one-time codes");
  }
  return sendTwilioSms(phone, text);
};
