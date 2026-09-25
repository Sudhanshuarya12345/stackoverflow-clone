import Razorpay from "razorpay";
import mongoose from "mongoose";
import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import User from "../models/auth.js";
import { PLANS } from "../config/plans.js";
import { generateInvoicePdfBuffer } from "../utils/invoicePdf.js";
import { refreshUserPlanFromSubscription } from "../services/subscriptionAccess.js";

// Utility to get Razorpay instance lazily
const getRazorpayInstance = () => {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

export const createSubscription = async (req, res) => {
  try {
    const { plan } = req.body; // 'bronze', 'silver', 'gold'
    const planConfig = PLANS[plan];

    if (!planConfig || !planConfig.razorpayPlanId) {
      return res.status(400).json({ message: "Invalid plan selected" });
    }

    await refreshUserPlanFromSubscription(req.userid);
    const existingSub = await Subscription.findOne({
      userId: req.userid,
      status: { $in: ["created", "authenticated", "active", "pending", "cancellation_pending"] },
    });
    const rzp = getRazorpayInstance();
    if (existingSub?.status === "created" && existingSub.razorpay_subscription_id) {
      // Checkout was opened but not paid (e.g. the popup was closed). Confirm with Razorpay before replacing it.
      const remote = await rzp.subscriptions.fetch(existingSub.razorpay_subscription_id).catch(() => null);
      if (remote && remote.status !== "created") {
        existingSub.status = remote.status;
        await existingSub.save();
        await refreshUserPlanFromSubscription(req.userid);
        return res.status(409).json({ message: "Your previous payment is still being confirmed. Please check your billing dashboard in a minute." });
      }
      await rzp.subscriptions.cancel(existingSub.razorpay_subscription_id).catch(() => {});
      existingSub.status = "expired";
      await existingSub.save();
    } else if (existingSub) {
      const stalePending = ["authenticated", "pending"].includes(existingSub.status)
        && existingSub.createdAt < new Date(Date.now() - 30 * 60 * 1000);
      if (stalePending) {
        existingSub.status = "expired";
        await existingSub.save();
      } else if (existingSub.status === "cancellation_pending") {
        const until = existingSub.current_period_end ? new Date(existingSub.current_period_end).toDateString() : "the end of the billing period";
        return res.status(409).json({ message: `Your ${existingSub.plan} plan is cancelled but stays active until ${until}. You can subscribe again after it ends.` });
      } else if (existingSub.status === "active") {
        return res.status(409).json({ message: `You already have an active ${existingSub.plan} subscription. Cancel it from the billing dashboard to change plans.` });
      } else {
        return res.status(409).json({ message: "Your previous payment is still being confirmed. Please check your billing dashboard in a minute." });
      }
    }

    const subscription = await rzp.subscriptions.create({
      plan_id: planConfig.razorpayPlanId,
      customer_notify: 0,
      total_count: 120, // max allowed
    });

    // Create a pending subscription record
    await Subscription.create({
      userId: req.userid,
      plan: plan,
      razorpay_subscription_id: subscription.id,
      status: "created",
    });

    res.status(200).json({
      subscription_id: subscription.id,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Error creating subscription:", error);
    res.status(500).json({ message: "Could not create subscription" });
  }
};

export const getMySubscription = async (req, res) => {
  try {
    await refreshUserPlanFromSubscription(req.userid);
    const sub = await Subscription.findOne({ userId: req.userid }).sort({ createdAt: -1 });
    const user = await User.findById(req.userid).select("plan questionsToday questionResetDate bookmarks");
    res.status(200).json({ subscription: sub, userPlanDetails: user });
  } catch (error) {
    console.error("Error getting subscription:", error);
    res.status(500).json({ message: "Could not fetch subscription" });
  }
};

export const getMyInvoices = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const skip = (page - 1) * limit;
    const filter = { userId: req.userid };
    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Payment.countDocuments(filter),
    ]);
    res.status(200).json({ invoices: payments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error("Error getting invoices:", error);
    res.status(500).json({ message: "Could not fetch invoices" });
  }
};

export const downloadInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.id; // Razorpay payment ID or ObjectId
    const idFilter = mongoose.Types.ObjectId.isValid(invoiceId)
      ? [{ _id: invoiceId }, { razorpay_payment_id: invoiceId }]
      : [{ razorpay_payment_id: invoiceId }];

    const payment = await Payment.findOne({
      $or: idFilter,
      userId: req.userid,
      status: "captured"
    }).populate("subscriptionId");

    if (!payment) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const user = await User.findById(req.userid);
    const planName = payment.subscriptionId ? payment.subscriptionId.plan : "Premium";
    
    const buffer = await generateInvoicePdfBuffer(payment, user, { name: planName.toUpperCase() });
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${payment.invoice_number}.pdf`);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Error downloading invoice:", error);
    res.status(500).json({ message: "Could not generate invoice PDF" });
  }
};

export const reconcileMySubscription = async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.userid }).sort({ createdAt: -1 });
    if (!sub?.razorpay_subscription_id) {
      await refreshUserPlanFromSubscription(req.userid);
      return res.status(200).json({ subscription: sub, message: "No Razorpay subscription to reconcile" });
    }

    const rzp = getRazorpayInstance();
    const remoteSub = await rzp.subscriptions.fetch(sub.razorpay_subscription_id);
    const updates = { status: remoteSub.status };
    if (remoteSub.current_start) updates.current_period_start = new Date(remoteSub.current_start * 1000);
    if (remoteSub.current_end) updates.current_period_end = new Date(remoteSub.current_end * 1000);

    if (["cancelled", "completed", "halted"].includes(remoteSub.status) && sub.current_period_end && new Date(sub.current_period_end) > new Date()) {
      updates.status = "cancellation_pending";
      updates.cancel_at_period_end = true;
      updates.cancelled_at = new Date();
    }

    const updated = await Subscription.findByIdAndUpdate(sub._id, updates, { new: true });
    const userState = await refreshUserPlanFromSubscription(req.userid);
    res.status(200).json({ subscription: updated, userPlanDetails: userState });
  } catch (error) {
    console.error("Error reconciling subscription:", error);
    res.status(500).json({ message: "Could not reconcile subscription" });
  }
};

export const cancelMySubscription = async (req, res) => {
  try {
    const sub = await Subscription.findOne({
      userId: req.userid,
      status: { $in: ["active", "cancellation_pending"] },
    }).sort({ createdAt: -1 });

    if (!sub) {
      return res.status(404).json({ message: "Active subscription not found" });
    }

    const rzp = getRazorpayInstance();
    await rzp.subscriptions.cancel(sub.razorpay_subscription_id, true);

    sub.status = "cancellation_pending";
    sub.cancel_at_period_end = true;
    sub.cancelled_at = new Date();
    await sub.save();

    res.status(200).json({ subscription: sub, message: "Subscription will remain active until the paid period ends." });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    res.status(500).json({ message: "Could not cancel subscription" });
  }
};

export const getMyBillingDetails = async (req, res) => {
  try {
    const user = await User.findById(req.userid).select("billingDetails email name");
    res.status(200).json({ billingDetails: user?.billingDetails || {} });
  } catch (error) {
    console.error("Error getting billing details:", error);
    res.status(500).json({ message: "Could not fetch billing details" });
  }
};

export const updateMyBillingDetails = async (req, res) => {
  try {
    const allowed = [
      "billingName", "billingEmail", "addressLine1", "addressLine2",
      "city", "state", "country", "postalCode", "gstNumber",
    ];
    const cleaned = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) cleaned[field] = req.body[field];
    });
    const user = await User.findByIdAndUpdate(
      req.userid,
      { $set: { billingDetails: { ...req.body.billingDetails, ...cleaned } } },
      { new: true }
    ).select("billingDetails email name");
    res.status(200).json({ billingDetails: user?.billingDetails || {} });
  } catch (error) {
    console.error("Error updating billing details:", error);
    res.status(500).json({ message: "Could not update billing details" });
  }
};
