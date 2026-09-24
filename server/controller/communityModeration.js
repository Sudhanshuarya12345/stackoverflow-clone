import CommunityPost from "../models/CommunityPost.js";
import Report from "../models/Report.js";
import User from "../models/auth.js";

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(25, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

export const getReports = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = req.query.status ? { status: req.query.status } : {};
    const [data, total] = await Promise.all([
      Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "postId", populate: { path: "author", select: "name plan suspended" } })
        .populate("reporterId", "name plan")
        .populate("reviewedBy", "name")
        .lean(),
      Report.countDocuments(filter),
    ]);
    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load reports" });
  }
};

export const reviewReport = async (req, res) => {
  try {
    const { action } = req.body;
    if (!["dismiss", "remove"].includes(action)) return res.status(400).json({ message: "Choose dismiss or remove" });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (action === "remove") await CommunityPost.findByIdAndUpdate(report.postId, { status: "removed" });
    report.status = action === "remove" ? "removed" : "dismissed";
    report.reviewedBy = req.userid;
    report.reviewedAt = new Date();
    await report.save();
    res.status(200).json({ data: report });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not review report" });
  }
};

export const suspendUser = async (req, res) => {
  try {
    const { suspended = true, reason = "Community policy violation" } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { suspended: Boolean(suspended), suspendedReason: suspended ? reason : "" },
      { new: true }
    ).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ data: user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update suspension" });
  }
};
