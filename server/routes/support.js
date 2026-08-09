import express from "express";
import { createSupportTicket, getMySupportTickets, getSupportInfo } from "../controller/support.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/tickets", auth, createSupportTicket);
router.get("/tickets", auth, getMySupportTickets);
router.get("/info", auth, getSupportInfo);

export default router;