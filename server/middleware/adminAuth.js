import User from "../models/auth.js";

const adminAuth = async (req, res, next) => {
  try {
    const user = await User.findById(req.userid).select("role");
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Administrator access required" });
    }
    next();
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not verify admin access" });
  }
};

export default adminAuth;
