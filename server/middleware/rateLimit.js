import { getClientIp } from "../services/deviceInfo.js";

// Small fixed-window, in-memory limiter keyed by client IP (enough for a single server instance).
// Used on login/OTP/reset endpoints to slow down password and code guessing.
const rateLimit = ({ windowMs, max, message }) => {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const key = getClientIp(req) || "unknown";
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message });
    }
    next();
  };
};

const MINUTE = 60 * 1000;

export const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  max: 20,
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

export const otpLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  max: 30,
  message: "Too many verification attempts. Please wait a few minutes and try again.",
});

export const signupLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  max: 20,
  message: "Too many accounts created from this network. Please try again later.",
});
