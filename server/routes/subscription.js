import express from "express";
import { createSubscription, getMySubscription, getMyInvoices, downloadInvoice } from "../controller/subscription.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/create", auth, createSubscription);
router.get("/me", auth, getMySubscription);
router.get("/invoices", auth, getMyInvoices);
router.get("/invoices/:id/download", auth, downloadInvoice);

export default router;
