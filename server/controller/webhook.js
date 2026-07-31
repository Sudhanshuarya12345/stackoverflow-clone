import crypto from "crypto";
import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import User from "../models/auth.js";
import { sendSubscriptionEmail } from "../utils/mailer.js";
import { generateInvoicePdfBuffer } from "../utils/invoicePdf.js";

const verifySignature = (reqBodyBuffer, signature) => {
  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET);
  hmac.update(reqBodyBuffer);
  const generatedSignature = hmac.digest("hex");
  return generatedSignature === signature;
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!verifySignature(req.body, signature)) {
      return res.status(400).send("Invalid signature");
    }

    // Now safely parse the JSON
    const event = JSON.parse(req.body.toString("utf8"));
    const { type, payload } = event;

    if (type === "subscription.activated") {
      const subPayload = payload.subscription.entity;
      
      const sub = await Subscription.findOneAndUpdate(
        { razorpay_subscription_id: subPayload.id },
        { 
          status: "active",
          current_period_start: new Date(subPayload.current_start * 1000),
          current_period_end: new Date(subPayload.current_end * 1000)
        },
        { new: true }
      );
      if (sub) {
        await User.findByIdAndUpdate(sub.userId, { plan: sub.plan });
      }
    } 
    else if (type === "subscription.charged") {
      const subPayload = payload.subscription.entity;
      const paymentPayload = payload.payment.entity;

      // Upsert Subscription
      const sub = await Subscription.findOneAndUpdate(
        { razorpay_subscription_id: subPayload.id },
        { 
          status: "active",
          current_period_start: new Date(subPayload.current_start * 1000),
          current_period_end: new Date(subPayload.current_end * 1000)
        },
        { new: true }
      );

      if (sub) {
        await User.findByIdAndUpdate(sub.userId, { plan: sub.plan });

        // Upsert Payment (Idempotent)
        const existingPayment = await Payment.findOne({ razorpay_payment_id: paymentPayload.id });
        if (!existingPayment) {
          const invoiceNumber = `INV-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${paymentPayload.id.slice(-6).toUpperCase()}`;
          const newPayment = await Payment.create({
            userId: sub.userId,
            subscriptionId: sub._id,
            razorpay_payment_id: paymentPayload.id,
            amount: paymentPayload.amount,
            status: "captured",
            invoice_number: invoiceNumber,
          });

          // Send confirmation email
          const user = await User.findById(sub.userId);
          if (user) {
            const pdfBuffer = await generateInvoicePdfBuffer(newPayment, user, { name: sub.plan.toUpperCase() });
            await sendSubscriptionEmail(user.email, sub.plan.toUpperCase(), invoiceNumber, pdfBuffer);
          }
        }
      }
    }
    else if (type === "subscription.cancelled" || type === "subscription.halted" || type === "subscription.completed") {
      const subPayload = payload.subscription.entity;
      const statusMapping = {
        "subscription.cancelled": "cancelled",
        "subscription.halted": "halted",
        "subscription.completed": "completed"
      };
      const sub = await Subscription.findOneAndUpdate(
        { razorpay_subscription_id: subPayload.id },
        { status: statusMapping[type] },
        { new: true }
      );
      if (sub) {
        await User.findByIdAndUpdate(sub.userId, { plan: "free" });
      }
    }
    else if (type === "payment.failed") {
      const paymentPayload = payload.payment.entity;
      // We only care about tracking failed payments if they are related to a subscription,
      // but without the subscription entity in payload we might need to search by email or contact or just log it.
      // Often, subscription will go to halted state eventually.
      console.log(`Payment failed: ${paymentPayload.id}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).send("Internal Error");
  }
};
