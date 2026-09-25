import { resolveSession } from "./auth.js";

const optionalAuth = async (req, res, next) => {
  try {
    const resolved = await resolveSession(req);
    req.userid = resolved?.userId || null;
    req.sessionId = resolved?.session._id;
  } catch (error) {
    req.userid = null;
  }
  next();
};

export default optionalAuth;
