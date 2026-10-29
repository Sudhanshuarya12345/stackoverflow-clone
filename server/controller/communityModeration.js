import CommunityPost from "../models/CommunityPost.js";
import { runInTransaction } from "../services/transaction.js";
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
    const existing = await Report.findById(req.params.id).select("_id");
    if (!existing) return res.status(404).json({ message: "Report not found" });
    // Closing the report, removing the post, the author's penalty/suspension and closing duplicate reports commit
    // together. The report is claimed conditionally, so two admins cannot review (and penalise) it twice.
    const result = await runInTransaction(async (session) => {
      const report = await Report.findOneAndUpdate(
        { _id: req.params.id, status: "pending" },
        { status: action === "remove" ? "removed" : "dismissed", reviewedBy: req.userid, reviewedAt: new Date() },
        { new: true, session }
      );
      if (!report) return null;
      let authorSuspended = false;
      if (action === "remove") {
        // Only the first removal of a post penalises the author, even if several reports point at it.
        const post = await CommunityPost.findOneAndUpdate({ _id: report.postId, status: "active" }, { status: "removed" }, { session });
        if (post) {
          const penalty = await penalizeRemovedContent(
            post.author,
            req.userid,
            "Community post removed by an administrator for violating guidelines",
            { postId: post._id },
            { session }
          );
          authorSuspended = penalty.suspended;
        }
        await Report.updateMany(
          { postId: report.postId, status: "pending", _id: { $ne: report._id } },
          { status: "removed", reviewedBy: req.userid, reviewedAt: new Date() },
          { session }
        );
      }
      return { report, authorSuspended };
    });
    if (!result) return res.status(400).json({ message: "This report was already reviewed" });
    res.status(200).json({ data: result.report, authorSuspended: result.authorSuspended });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not review report" });
  }
};

export const suspendUser = async (req, res) => {
  try {
    const { suspended = true } = req.body;
    const reason = String(req.body.reason || "Community policy violation").trim().slice(0, 300);
    const target = await User.findById(req.params.id).select("role");
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.role === "admin") return res.status(400).json({ message: "Administrators cannot be suspended" });
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { suspended: Boolean(suspended), suspendedReason: suspended ? reason : "" },
      { new: true }
    ).select("-password");
    if (user.suspended) await revokeUserSessions(user._id, "suspended");
    res.status(200).json({ data: user });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update suspension" });
  }
};
