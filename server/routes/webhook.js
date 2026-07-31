import express from "express";
import { handleRazorpayWebhook } from "../controller/webhook.js";

const router = express.Router();

router.post("/razorpay", handleRazorpayWebhook);

export default router;
