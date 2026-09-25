import jwt from "jsonwebtoken";
import { validateSession } from "../services/sessionService.js";

// Resolves the bearer token to a live session. Returns null for missing, invalid, revoked or idle sessions.
export const resolveSession = async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
  const session = await validateSession(decoded?.id, decoded?.sid);
  return session ? { userId: decoded.id, session } : null;
};

const auth = async (req, res, next) => {
  try {
    const resolved = await resolveSession(req);
    if (!resolved) {
      return res.status(401).json({ message: "Your session has expired or was signed out. Please log in again." });
    }
    req.userid = resolved.userId;
    req.sessionId = resolved.session._id;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
export default auth;
