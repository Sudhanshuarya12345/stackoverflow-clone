import mongoose from "mongoose";
import CommunityPost from "../models/CommunityPost.js";
import Follow from "../models/Follow.js";
import Report from "../models/Report.js";
import User from "../models/auth.js";
import { notify } from "../services/notificationService.js";

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(25, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

export const followUser = async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (!mongoose.Types.ObjectId.isValid(targetId)) return res.status(400).json({ message: "User unavailable" });
    if (String(targetId) === String(req.userid)) return res.status(400).json({ message: "You cannot follow yourself" });
    const target = await User.findById(targetId).select("_id");
    if (!target) return res.status(404).json({ message: "User not found" });

    const existing = await Follow.findOne({ follower: req.userid, following: targetId });
    if (!existing) {
      await Follow.create({ follower: req.userid, following: targetId });
      await Promise.all([
        User.findByIdAndUpdate(req.userid, { $inc: { followingCount: 1 } }),
        User.findByIdAndUpdate(targetId, { $inc: { followersCount: 1 } }),
        notify({ recipient: targetId, actor: req.userid, type: "follow" }),
      ]);
    }
    res.status(200).json({ following: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not follow user" });
  }
};

export const unfollowUser = async (req, res) => {
  try {
    const deleted = await Follow.findOneAndDelete({ follower: req.userid, following: req.params.userId });
    if (deleted) {
      await Promise.all([
        User.findByIdAndUpdate(req.userid, { $inc: { followingCount: -1 } }),
        User.findByIdAndUpdate(req.params.userId, { $inc: { followersCount: -1 } }),
      ]);
    }
    res.status(200).json({ following: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not unfollow user" });
  }
};

export const getFollowState = async (req, res) => {
  try {
    const following = Boolean(req.userid && (await Follow.exists({ follower: req.userid, following: req.params.userId })));
    res.status(200).json({ following });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load follow state" });
  }
};

export const getFollowers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const [data, total] = await Promise.all([
      Follow.find({ following: req.params.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("follower", "name plan").lean(),
      Follow.countDocuments({ following: req.params.userId }),
    ]);
    res.status(200).json({ data: data.map((item) => item.follower), total, page, limit });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load followers" });
  }
};

export const getFollowing = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const [data, total] = await Promise.all([
      Follow.find({ follower: req.params.userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("following", "name plan").lean(),
      Follow.countDocuments({ follower: req.params.userId }),
    ]);
    res.status(200).json({ data: data.map((item) => item.following), total, page, limit });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load following" });
  }
};

export const reportPost = async (req, res) => {
  try {
    const { reason, details = "" } = req.body;
    if (!reason?.trim()) return res.status(400).json({ message: "Report reason is required" });
    const post = await CommunityPost.findOne({ _id: req.params.id, status: "active" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    const existing = await Report.findOne({ postId: post._id, reporterId: req.userid });
    if (existing) return res.status(409).json({ message: "You already reported this post" });
    await Report.create({ postId: post._id, reporterId: req.userid, reason: reason.trim(), details: details.trim() });
    await CommunityPost.findByIdAndUpdate(post._id, { $inc: { reportsCount: 1 } });
    res.status(201).json({ message: "Report submitted for review" });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "You already reported this post" });
    console.log(error);
    res.status(500).json({ message: "Could not report post" });
  }
};
