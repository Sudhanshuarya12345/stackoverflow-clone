import express from "express";
import auth from "../middleware/auth.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { getExclusiveCommunity } from "../controller/community.js";
import optionalAuth from "../middleware/optionalAuth.js";
import requireActiveUser from "../middleware/requireActiveUser.js";
import {
  addComment,
  addReply,
  createPost,
  deletePost,
  getFeed,
  getHashtags,
  getPostById,
  getUserPosts,
  sharePost,
  toggleBookmark,
  toggleLike,
  updatePost,
} from "../controller/communityPost.js";
import {
  followUser,
  getFollowers,
  getFollowing,
  getFollowState,
  reportPost,
  unfollowUser,
} from "../controller/communitySocial.js";

const router = express.Router();

router.get("/exclusive", auth, requirePlan("gold"), getExclusiveCommunity);
router.get("/feed", optionalAuth, getFeed);
router.get("/hashtags", getHashtags);
router.post("/posts", auth, requireActiveUser, createPost);
router.get("/posts/:id", optionalAuth, getPostById);
router.patch("/posts/:id", auth, requireActiveUser, updatePost);
router.delete("/posts/:id", auth, deletePost);
router.patch("/posts/:id/like", auth, requireActiveUser, toggleLike);
router.patch("/posts/:id/bookmark", auth, requireActiveUser, toggleBookmark);
router.post("/posts/:id/share", auth, requireActiveUser, sharePost);
router.post("/posts/:id/comments", auth, requireActiveUser, addComment);
router.post("/posts/:id/comments/:commentId/replies", auth, requireActiveUser, addReply);
router.post("/posts/:id/report", auth, reportPost);
router.get("/users/:userId/posts", optionalAuth, getUserPosts);
router.get("/users/:userId/follow-state", optionalAuth, getFollowState);
router.get("/users/:userId/followers", getFollowers);
router.get("/users/:userId/following", getFollowing);
router.post("/follow/:userId", auth, requireActiveUser, followUser);
router.delete("/follow/:userId", auth, requireActiveUser, unfollowUser);

export default router;
