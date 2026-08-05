import express from "express";
import auth from "../middleware/auth.js";
import { requirePlan } from "../middleware/requirePlan.js";
import { getExclusiveCommunity } from "../controller/community.js";

const router = express.Router();

router.get("/exclusive", auth, requirePlan("gold"), getExclusiveCommunity);

export default router;
