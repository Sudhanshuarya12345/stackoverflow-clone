import crypto from "crypto";
import jwt from "jsonwebtoken";
import Session from "../models/Session.js";
import LoginHistory from "../models/LoginHistory.js";
import TrustedDevice from "../models/TrustedDevice.js";

const minutesFromEnv = (name, fallback) => {
  const value = parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const SESSION_INACTIVITY_MS = () => minutesFromEnv("SESSION_INACTIVITY_MINUTES", 60) * 60 * 1000;
export const SESSION_MAX_AGE_MS = () => minutesFromEnv("SESSION_MAX_AGE_MINUTES", 7 * 24 * 60) * 60 * 1000;
export const TRUSTED_DEVICE_MS = () => minutesFromEnv("TRUSTED_DEVICE_DAYS", 30) * 24 * 60 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000;

export const createSession = async (user, device, { method = "password", newDevice = false } = {}) => {
  const tokenId = crypto.randomUUID();
  const now = Date.now();
  const session = await Session.create({
    user: user._id,
    tokenId,
    deviceHash: device.deviceHash,
    browser: device.browser,
    os: device.os,
    deviceType: device.deviceType,
    ip: device.ip,
    location: device.location,
    userAgent: device.userAgent,
    lastActiveAt: new Date(now),
    expiresAt: new Date(now + SESSION_MAX_AGE_MS()),
  });
  await LoginHistory.create({
    user: user._id,
    session: session._id,
    method,
    browser: device.browser,
    os: device.os,
    deviceType: device.deviceType,
    ip: device.ip,
    location: device.location,
    userAgent: device.userAgent,
    newDevice,
  });
  const token = jwt.sign({ email: user.email, id: user._id, sid: tokenId }, process.env.JWT_SECRET, {
    expiresIn: Math.floor(SESSION_MAX_AGE_MS() / 1000),
  });
  return { token, session };
};

// Returns the session if it is still usable; revokes it if it has gone idle. Refreshes lastActiveAt.
export const validateSession = async (userId, tokenId) => {
  if (!tokenId) return null;
  const session = await Session.findOne({ tokenId, user: userId });
  if (!session || session.revokedAt) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await Session.updateOne({ _id: session._id }, { revokedAt: new Date(), revokedReason: "expired" });
    return null;
  }
  if (now - session.lastActiveAt.getTime() > SESSION_INACTIVITY_MS()) {
    await Session.updateOne({ _id: session._id }, { revokedAt: new Date(), revokedReason: "inactive" });
    return null;
  }
  if (now - session.lastActiveAt.getTime() > ACTIVITY_WRITE_THROTTLE_MS) {
    await Session.updateOne({ _id: session._id }, { lastActiveAt: new Date(now) });
  }
  return session;
};

export const revokeUserSessions = async (userId, reason, exceptSessionId) => {
  const filter = { user: userId, revokedAt: { $exists: false } };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const result = await Session.updateMany(filter, { revokedAt: new Date(), revokedReason: reason });
  return result.modifiedCount;
};

export const expireInactiveSessions = async () => {
  const now = Date.now();
  const result = await Session.updateMany(
    {
      revokedAt: { $exists: false },
      $or: [{ lastActiveAt: { $lt: new Date(now - SESSION_INACTIVITY_MS()) } }, { expiresAt: { $lte: new Date(now) } }],
    },
    { revokedAt: new Date(), revokedReason: "inactive" }
  );
  return result.modifiedCount;
};

export const isTrustedDevice = async (userId, deviceHash) => {
  if (!deviceHash) return false;
  const device = await TrustedDevice.findOne({ user: userId, deviceHash, expiresAt: { $gt: new Date() } });
  if (!device) return false;
  device.lastUsedAt = new Date();
  await device.save();
  return true;
};

export const trustDevice = async (userId, device) => {
  if (!device.deviceHash) return;
  await TrustedDevice.findOneAndUpdate(
    { user: userId, deviceHash: device.deviceHash },
    {
      label: `${device.browser} on ${device.os} (${device.deviceType})`,
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_MS()),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

export const hasSeenDevice = async (userId, deviceHash) =>
  Boolean(deviceHash && (await Session.exists({ user: userId, deviceHash })));
