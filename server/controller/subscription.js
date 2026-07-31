import Razorpay from "razorpay";
import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import User from "../models/auth.js";
import { PLANS } from "../config/plans.js";
import { generateInvoicePdfBuffer } from "../utils/invoicePdf.js";

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

    const rzp = getRazorpayInstance();
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
    const sub = await Subscription.findOne({ userId: req.userid }).sort({ createdAt: -1 });
    const user = await User.findById(req.userid).select("plan questionsToday questionResetDate");
    res.status(200).json({ subscription: sub, userPlanDetails: user });
  } catch (error) {
    console.error("Error getting subscription:", error);
    res.status(500).json({ message: "Could not fetch subscription" });
  }
};

export const getMyInvoices = async (req, res) => {
  try {
    const payments = await Payment.find({ userId: req.userid, status: "captured" }).sort({ createdAt: -1 });
    res.status(200).json({ invoices: payments });
  } catch (error) {
    console.error("Error getting invoices:", error);
    res.status(500).json({ message: "Could not fetch invoices" });
  }
};

export const downloadInvoice = async (req, res) => {
  try {
    const invoiceId = req.params.id; // Razorpay payment ID or ObjectId
    const payment = await Payment.findOne({
      $or: [{ _id: invoiceId }, { razorpay_payment_id: invoiceId }],
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
