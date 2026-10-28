import User from "../models/auth.js";
import { translateText } from "../i18n/index.js";

export const getExclusiveCommunity = async (req, res) => {
  try {
    const members = await User.countDocuments({ plan: "gold" });
    res.status(200).json({
      message: "Welcome to the Gold exclusive community.",
      content: {
        announcements: [
          "Gold members get first access to new features.",
          "Private Q&A sessions with top contributors.",
          "Early access to platform roadmap discussions.",
        ].map((text) => translateText(text, req.language)),
        resources: [
          "Exclusive webinars and mentoring sessions",
          "Advanced API access and documentation",
          "Priority feedback channel for product decisions",
        ].map((text) => translateText(text, req.language)),
        memberCount: members,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load community" });
  }
};