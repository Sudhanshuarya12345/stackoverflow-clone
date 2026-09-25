import express from "express";
import { getReports, reviewReport, suspendUser } from "../controller/communityModeration.js";
import adminAuth from "../middleware/adminAuth.js";
import auth from "../middleware/auth.js";
import { getLoginActivity } from "../controller/security.js";

const router = express.Router();

router.get("/reports", auth, adminAuth, getReports);
router.patch("/reports/:id", auth, adminAuth, reviewReport);
router.patch("/users/:id/suspend", auth, adminAuth, suspendUser);
router.get("/login-activity", auth, adminAuth, getLoginActivity);

export default router;
