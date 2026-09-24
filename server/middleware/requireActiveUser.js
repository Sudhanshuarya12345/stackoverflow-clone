import User from "../models/auth.js";

const requireActiveUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.userid).select("suspended suspendedReason");
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.suspended) {
      return res.status(403).json({ message: user.suspendedReason || "Your account is suspended." });
    }
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not verify account status" });
  }
};

export default requireActiveUser;
