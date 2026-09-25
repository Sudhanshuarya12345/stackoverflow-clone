import CommunityPost from "../models/CommunityPost.js";
import Report from "../models/Report.js";
import User from "../models/auth.js";
import { penalizeRemovedContent } from "../services/reputationService.js";
import { revokeUserSessions } from "../services/sessionService.js";

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
        .populate({ path: "postId", populate: { path: "author", select: "name plan suspended removedContentCount reputation" } })
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
    if (report.status !== "pending") return res.status(400).json({ message: "This report was already reviewed" });
    let authorSuspended = false;
    if (action === "remove") {
      // Only the first removal of a post penalises the author, even if several reports point at it.
      const post = await CommunityPost.findOneAndUpdate({ _id: report.postId, status: "active" }, { status: "removed" });
      if (post) {
        const result = await penalizeRemovedContent(post.author, req.userid, "Community post removed by an administrator for violating guidelines", { postId: post._id });
        authorSuspended = result.suspended;
      }
      await Report.updateMany(
        { postId: report.postId, status: "pending", _id: { $ne: report._id } },
        { status: "removed", reviewedBy: req.userid, reviewedAt: new Date() }
      );
    }
    report.status = action === "remove" ? "removed" : "dismissed";
    report.reviewedBy = req.userid;
    report.reviewedAt = new Date();
    await report.save();
    res.status(200).json({ data: report, authorSuspended });
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
    if (user.suspended) await revokeUserSessions(user._id, "suspended");
    res.status(200).json({ data: user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update suspension" });
  }
};
