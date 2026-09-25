import mongoose from "mongoose";
import CommunityPost from "../models/CommunityPost.js";
import Follow from "../models/Follow.js";
import User from "../models/auth.js";
import { destroyCommunityImage, uploadCommunityImage } from "../services/cloudinary.js";
import { extractHashtags, findMentionedUsers, notify, notifyMentions } from "../services/notificationService.js";
import { PRIVILEGES, penalizeRemovedContent, userHasPrivilege } from "../services/reputationService.js";

const commentPrivilegeError = async (userId, ownerIds) => {
  if (ownerIds.some((ownerId) => String(ownerId) === String(userId))) return null;
  if (await userHasPrivilege(userId, "comment")) return null;
  return `You need ${PRIVILEGES.comment.threshold} reputation to comment on other members' posts.`;
};

const MAX_IMAGES = 4;
const MAX_LIMIT = 25;

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
};

const canAccessPost = (post, userId) => post?.status === "active" || String(post?.author) === String(userId);

const uploadImages = async (images = []) => {
  const safeImages = images.filter(Boolean).slice(0, MAX_IMAGES);
  return Promise.all(safeImages.map((image) => uploadCommunityImage(image)));
};

const destroyImages = async (images = []) => {
  await Promise.all(images.map((image) => destroyCommunityImage(image.publicId).catch((error) => console.log(error))));
};

const buildPostResponse = async (post, userId) => {
  const author = await User.findById(post.author).select("name plan role followersCount followingCount").lean();
  await post.populate([
    { path: "comments.user", select: "name plan" },
    { path: "comments.replies.user", select: "name plan" },
  ]);
  return {
    ...post.toObject(),
    author,
    likesCount: post.likes?.length || 0,
    commentsCount: (post.comments || []).reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0),
    bookmarksCount: post.bookmarks?.length || 0,
    likedByMe: Boolean(userId && post.likes?.some((id) => String(id) === String(userId))),
    bookmarkedByMe: Boolean(userId && post.bookmarks?.some((id) => String(id) === String(userId))),
    isFollowing: Boolean(userId && (await Follow.exists({ follower: userId, following: post.author }))),
  };
};

export const createPost = async (req, res) => {
  try {
    const { content = "", type = "update", images = [], code = {} } = req.body;
    const normalizedContent = content.trim();
    const hasCode = Boolean(code?.code?.trim());
    if (!normalizedContent && !images.length && !hasCode) {
      return res.status(400).json({ message: "Add text, an image, or a code snippet before posting." });
    }

    const uploadedImages = await uploadImages(images);
    const mentionedUsers = await findMentionedUsers(normalizedContent);
    const post = await CommunityPost.create({
      author: req.userid,
      content: normalizedContent,
      type,
      images: uploadedImages,
      code: hasCode ? { language: code.language || "text", code: code.code.trim() } : undefined,
      hashtags: extractHashtags(normalizedContent),
      mentions: mentionedUsers.map((u) => u._id),
    });

    await notifyMentions({ users: mentionedUsers, actor: req.userid, postId: post._id });
    res.status(201).json({ data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message || "Could not create post" });
  }
};

export const getFeed = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const { tab = "latest", hashtag, q } = req.query;
    const filter = { status: "active" };
    if (hashtag) filter.hashtags = String(hashtag).replace(/^#/, "").toLowerCase();
    if (q) filter.$text = { $search: q };

    if (tab === "following") {
      if (!req.userid) return res.status(401).json({ message: "Login required for your following feed" });
      const follows = await Follow.find({ follower: req.userid }).select("following").lean();
      const authorIds = follows.map((f) => f.following);
      authorIds.push(new mongoose.Types.ObjectId(req.userid));
      filter.author = { $in: authorIds };
    }

    const sortSpec = tab === "trending" ? { trendingScore: -1, createdAt: -1 } : { createdAt: -1 };
    const [result] = await CommunityPost.aggregate([
      { $match: filter },
      {
        $addFields: {
          commentsCount: {
            $reduce: {
              input: "$comments",
              initialValue: 0,
              in: { $add: ["$$value", 1, { $size: { $ifNull: ["$$this.replies", []] } }] },
            },
          },
          likesCount: { $size: { $ifNull: ["$likes", []] } },
          ageHours: { $divide: [{ $subtract: [new Date(), "$createdAt"] }, 3600000] },
        },
      },
      {
        $addFields: {
          trendingScore: {
            $divide: [
              { $add: [{ $multiply: ["$likesCount", 2] }, { $multiply: ["$commentsCount", 3] }, { $multiply: ["$shares", 4] }, "$engagementScore"] },
              { $pow: [{ $add: ["$ageHours", 2] }, 1.5] },
            ],
          },
        },
      },
      { $sort: sortSpec },
      {
        $facet: {
          total: [{ $count: "count" }],
          items: [
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "users",
                localField: "author",
                foreignField: "_id",
                as: "author",
                pipeline: [{ $project: { name: 1, plan: 1, role: 1, followersCount: 1, followingCount: 1 } }],
              },
            },
            { $unwind: "$author" },
          ],
        },
      },
    ]);

    const followedIds = new Set();
    if (req.userid) {
      const follows = await Follow.find({ follower: req.userid }).select("following").lean();
      follows.forEach((f) => followedIds.add(String(f.following)));
    }
    const items = (result.items || []).map((post) => ({
      ...post,
      likedByMe: Boolean(req.userid && post.likes?.some((id) => String(id) === String(req.userid))),
      bookmarkedByMe: Boolean(req.userid && post.bookmarks?.some((id) => String(id) === String(req.userid))),
      isFollowing: Boolean(req.userid && followedIds.has(String(post.author?._id))),
    }));
    const total = result.total[0]?.count || 0;
    res.status(200).json({ data: items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load feed" });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Post unavailable" });
    const post = await CommunityPost.findById(id)
      .populate("author", "name plan role followersCount followingCount")
      .populate("comments.user", "name plan")
      .populate("comments.replies.user", "name plan");
    if (!post || !canAccessPost(post, req.userid)) return res.status(404).json({ message: "Post not found" });
    const postObject = post.toObject();
    const isFollowing = Boolean(req.userid && (await Follow.exists({ follower: req.userid, following: post.author._id })));
    res.status(200).json({
      data: {
        ...postObject,
        likesCount: post.likes.length,
        commentsCount: post.comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0),
        likedByMe: Boolean(req.userid && post.likes.some((uid) => String(uid) === String(req.userid))),
        bookmarkedByMe: Boolean(req.userid && post.bookmarks.some((uid) => String(uid) === String(req.userid))),
        isFollowing,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load post" });
  }
};

export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { content = "", type = "update", images = [], keepImageIds = [], code = {} } = req.body;
    const post = await CommunityPost.findById(id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const isOwner = String(post.author) === String(req.userid);
    if (!isOwner && !(await userHasPrivilege(req.userid, "editCommunityPosts"))) {
      return res.status(403).json({ message: `You need ${PRIVILEGES.editCommunityPosts.threshold} reputation to edit other members' posts.` });
    }
    if (!isOwner && post.status !== "active") return res.status(404).json({ message: "Post not found" });

    const removedImages = post.images.filter((image) => !keepImageIds.includes(image.publicId));
    await destroyImages(removedImages);
    const keptImages = post.images.filter((image) => keepImageIds.includes(image.publicId));
    const uploadedImages = await uploadImages(images);
    const normalizedContent = content.trim();
    const mentionedUsers = await findMentionedUsers(normalizedContent);

    post.content = normalizedContent;
    post.type = type;
    post.images = [...keptImages, ...uploadedImages].slice(0, MAX_IMAGES);
    post.code = code?.code?.trim() ? { language: code.language || "text", code: code.code.trim() } : { language: "text", code: "" };
    post.hashtags = extractHashtags(normalizedContent);
    post.mentions = mentionedUsers.map((u) => u._id);
    await post.save();

    await notifyMentions({ users: mentionedUsers, actor: req.userid, postId: post._id });
    res.status(200).json({ data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message || "Could not update post" });
  }
};

export const deletePost = async (req, res) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const user = await User.findById(req.userid).select("role");
    if (String(post.author) !== String(req.userid) && user?.role !== "admin") {
      return res.status(403).json({ message: "You cannot delete this post" });
    }
    await destroyImages(post.images);
    await CommunityPost.findByIdAndDelete(post._id);
    if (String(post.author) !== String(req.userid)) {
      await penalizeRemovedContent(post.author, req.userid, "Community post removed by an administrator", { postId: post._id });
    }
    res.status(200).json({ message: "Post deleted" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not delete post" });
  }
};

export const toggleLike = async (req, res) => {
  try {
    const post = await CommunityPost.findOne({ _id: req.params.id, status: "active" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    const liked = post.likes.some((id) => String(id) === String(req.userid));
    if (liked) {
      post.likes = post.likes.filter((id) => String(id) !== String(req.userid));
      post.engagementScore = Math.max(0, post.engagementScore - 2);
    } else {
      post.likes.push(req.userid);
      post.engagementScore += 2;
      await notify({ recipient: post.author, actor: req.userid, type: "like", postId: post._id });
    }
    await post.save();
    res.status(200).json({ liked: !liked, data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update like" });
  }
};

export const addComment = async (req, res) => {
  try {
    const { body = "" } = req.body;
    if (!body.trim()) return res.status(400).json({ message: "Comment body is required" });
    const post = await CommunityPost.findOne({ _id: req.params.id, status: "active" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    const privilegeError = await commentPrivilegeError(req.userid, [post.author]);
    if (privilegeError) return res.status(403).json({ message: privilegeError });
    const mentionedUsers = await findMentionedUsers(body);
    post.comments.push({ user: req.userid, body: body.trim() });
    post.engagementScore += 3;
    await post.save();
    await notify({ recipient: post.author, actor: req.userid, type: "comment", postId: post._id });
    await notifyMentions({ users: mentionedUsers, actor: req.userid, postId: post._id });
    res.status(201).json({ data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add comment" });
  }
};

export const addReply = async (req, res) => {
  try {
    const { body = "" } = req.body;
    if (!body.trim()) return res.status(400).json({ message: "Reply body is required" });
    const post = await CommunityPost.findOne({ _id: req.params.id, status: "active" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    const privilegeError = await commentPrivilegeError(req.userid, [post.author, comment.user]);
    if (privilegeError) return res.status(403).json({ message: privilegeError });
    const mentionedUsers = await findMentionedUsers(body);
    comment.replies.push({ user: req.userid, body: body.trim() });
    post.engagementScore += 3;
    await post.save();
    await notify({ recipient: comment.user, actor: req.userid, type: "reply", postId: post._id });
    await notify({ recipient: post.author, actor: req.userid, type: "reply", postId: post._id });
    await notifyMentions({ users: mentionedUsers, actor: req.userid, postId: post._id });
    res.status(201).json({ data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not add reply" });
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    const post = await CommunityPost.findOne({ _id: req.params.id, status: "active" });
    if (!post) return res.status(404).json({ message: "Post not found" });
    const bookmarked = post.bookmarks.some((id) => String(id) === String(req.userid));
    post.bookmarks = bookmarked ? post.bookmarks.filter((id) => String(id) !== String(req.userid)) : [...post.bookmarks, req.userid];
    await post.save();
    res.status(200).json({ bookmarked: !bookmarked, data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not update bookmark" });
  }
};

export const sharePost = async (req, res) => {
  try {
    const post = await CommunityPost.findOneAndUpdate(
      { _id: req.params.id, status: "active" },
      { $inc: { shares: 1, engagementScore: 4 } },
      { new: true }
    );
    if (!post) return res.status(404).json({ message: "Post not found" });
    await notify({ recipient: post.author, actor: req.userid, type: "share", postId: post._id });
    res.status(200).json({ data: await buildPostResponse(post, req.userid) });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not share post" });
  }
};

export const getHashtags = async (req, res) => {
  try {
    const q = String(req.query.q || "").replace(/^#/, "").toLowerCase();
    const match = { status: "active", hashtags: { $exists: true, $ne: [] } };
    const data = await CommunityPost.aggregate([
      { $match: match },
      { $unwind: "$hashtags" },
      ...(q ? [{ $match: { hashtags: { $regex: `^${q}` } } }] : []),
      { $group: { _id: "$hashtags", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 20 },
      { $project: { _id: 0, tag: "$_id", count: 1 } },
    ]);
    res.status(200).json({ data });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load hashtags" });
  }
};

export const getUserPosts = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query);
    const filter = { author: req.params.userId, status: "active" };
    const [data, total] = await Promise.all([
      CommunityPost.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("author", "name plan role").lean(),
      CommunityPost.countDocuments(filter),
    ]);
    res.status(200).json({ data, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Could not load user posts" });
  }
};
