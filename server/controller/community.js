import User from "../models/auth.js";

export const getExclusiveCommunity = async (req, res) => {
  try {
    const members = await User.countDocuments({ plan: { $in: ["silver", "gold"] } });
    res.status(200).json({
      message: "Welcome to the Gold exclusive community.",
      content: {
        announcements: [
          "Gold members get first access to new features.",
          "Private Q&A sessions with top contributors.",
          "Early access to platform roadmap discussions.",
        ],
        resources: [
          "Exclusive webinars and mentoring sessions",
          "Advanced API access and documentation",
          "Priority feedback channel for product decisions",
        ],
        memberCount: members,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load community" });
  }
};