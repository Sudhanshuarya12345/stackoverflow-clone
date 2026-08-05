import crypto from "crypto";
import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import User from "../models/auth.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { sendSubscriptionEmail } from "../utils/mailer.js";
import { generateInvoicePdfBuffer } from "../utils/invoicePdf.js";
import { PLANS } from "../config/plans.js";

const verifySignature = (reqBodyBuffer, signature) => {
  if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET);
  hmac.update(reqBodyBuffer);
  const generatedSignature = hmac.digest("hex");
  const expected = Buffer.from(generatedSignature, "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

const invoiceNumberForPayment = (paymentId) => {
  return `INV-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${paymentId}`.toUpperCase();
};

const assertPaymentMatchesPlan = (paymentPayload, plan) => {
  const planConfig = PLANS[plan];
  if (!planConfig) throw new Error(`Unknown plan ${plan}`);
  if (paymentPayload.amount !== planConfig.amountPaise) {
    throw new Error(`Amount mismatch for ${plan}: received ${paymentPayload.amount}, expected ${planConfig.amountPaise}`);
  }
  if ((paymentPayload.currency || "").toUpperCase() !== planConfig.currency) {
    throw new Error(`Currency mismatch for ${plan}: received ${paymentPayload.currency}`);
  }
};

const markSubscriptionEndedAtPeriodEnd = async (subPayload, status) => {
  const sub = await Subscription.findOne({ razorpay_subscription_id: subPayload.id });
  if (!sub) return;

  const now = new Date();
  const periodEnd = subPayload.current_end ? new Date(subPayload.current_end * 1000) : sub.current_period_end;
  if (periodEnd && periodEnd > now && ["cancelled", "halted", "completed"].includes(status)) {
    sub.status = "cancellation_pending";
    sub.cancel_at_period_end = true;
    sub.cancelled_at = now;
    sub.current_period_end = periodEnd;
    await sub.save();
    return;
  }

  sub.status = status === "completed" ? "expired" : status;
  sub.cancelled_at = now;
  if (periodEnd) sub.current_period_end = periodEnd;
  await sub.save();
  await User.findByIdAndUpdate(sub.userId, { plan: "free", $unset: { activeSubscriptionId: "" } });
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
    const eventId = event.id || `${type}-${event.created_at || Date.now()}-${payload?.payment?.entity?.id || payload?.subscription?.entity?.id || crypto.randomUUID()}`;

    try {
      await WebhookEvent.create({ eventId, type });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(200).send("Duplicate event ignored");
      }
      throw error;
    }

    if (type === "subscription.activated") {
      const subPayload = payload.subscription.entity;

      const sub = await Subscription.findOneAndUpdate(
        { razorpay_subscription_id: subPayload.id },
        { 
          status: "authenticated",
          ...(subPayload.current_start ? { current_period_start: new Date(subPayload.current_start * 1000) } : {}),
          ...(subPayload.current_end ? { current_period_end: new Date(subPayload.current_end * 1000) } : {})
        },
        { new: true }
      );
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
        assertPaymentMatchesPlan(paymentPayload, sub.plan);

        // Upsert Payment (Idempotent)
        const existingPayment = await Payment.findOne({ razorpay_payment_id: paymentPayload.id });
        if (!existingPayment) {
          const invoiceNumber = invoiceNumberForPayment(paymentPayload.id);
          const newPayment = await Payment.create({
            userId: sub.userId,
            subscriptionId: sub._id,
            razorpay_event_id: eventId,
            razorpay_payment_id: paymentPayload.id,
            transaction_id: paymentPayload.id,
            plan: sub.plan,
            amount: paymentPayload.amount,
            currency: paymentPayload.currency,
            status: "captured",
            payment_method: paymentPayload.method,
            billing_period_start: sub.current_period_start,
            billing_period_end: sub.current_period_end,
            invoice_number: invoiceNumber,
          });

          await User.findByIdAndUpdate(sub.userId, { plan: sub.plan, activeSubscriptionId: sub._id });

          // Send confirmation email
          const user = await User.findById(sub.userId);
          if (user) {
            const pdfBuffer = await generateInvoicePdfBuffer(newPayment, user, { name: sub.plan.toUpperCase() });
            await sendSubscriptionEmail(user.email, sub.plan.toUpperCase(), invoiceNumber, pdfBuffer);
            newPayment.invoice_email_sent_at = new Date();
            await newPayment.save();
          }
        } else {
          await User.findByIdAndUpdate(sub.userId, { plan: sub.plan, activeSubscriptionId: sub._id });
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
      await markSubscriptionEndedAtPeriodEnd(subPayload, statusMapping[type]);
    }
    else if (type === "payment.failed") {
      const paymentPayload = payload.payment.entity;
      const subPayload = payload.subscription?.entity;
      const sub = subPayload ? await Subscription.findOne({ razorpay_subscription_id: subPayload.id }) : null;
      if (sub) {
        await Payment.findOneAndUpdate(
          { razorpay_payment_id: paymentPayload.id },
          {
            userId: sub.userId,
            subscriptionId: sub._id,
            razorpay_event_id: eventId,
            razorpay_payment_id: paymentPayload.id,
            transaction_id: paymentPayload.id,
            plan: sub.plan,
            amount: paymentPayload.amount || 0,
            currency: paymentPayload.currency || "INR",
            status: "failed",
            payment_method: paymentPayload.method,
          },
          { upsert: true, new: true }
        );
      } else {
        console.log(`Payment failed for unknown subscription: ${paymentPayload.id}`);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).send("Internal Error");
  }
};
