import express from "express";
import { createSubscription, getMySubscription, getMyInvoices, downloadInvoice, reconcileMySubscription, cancelMySubscription, getMyBillingDetails, updateMyBillingDetails } from "../controller/subscription.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/create", auth, createSubscription);
router.get("/me", auth, getMySubscription);
router.post("/reconcile", auth, reconcileMySubscription);
router.post("/cancel", auth, cancelMySubscription);
router.get("/invoices", auth, getMyInvoices);
router.get("/invoices/:id/download", auth, downloadInvoice);
router.get("/billing", auth, getMyBillingDetails);
router.put("/billing", auth, updateMyBillingDetails);

export default router;
