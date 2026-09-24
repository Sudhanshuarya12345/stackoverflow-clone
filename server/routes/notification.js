import express from "express";
import { getNotifications, getUnreadCount, markAllRead, markRead } from "../controller/notification.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.get("/", auth, getNotifications);
router.get("/unread-count", auth, getUnreadCount);
router.patch("/read-all", auth, markAllRead);
router.patch("/:id/read", auth, markRead);

export default router;
