import crypto from "crypto";
import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import WebhookEvent from "../models/WebhookEvent.js";
import { recordSubscriptionPayment } from "../services/subscriptionBilling.js";
import { endSubscription } from "../services/subscriptionAccess.js";

const verifySignature = (reqBodyBuffer, signature) => {
  if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return false;
  const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET);
  hmac.update(reqBodyBuffer);
  const generatedSignature = hmac.digest("hex");
  const expected = Buffer.from(generatedSignature, "hex");
  const received = Buffer.from(String(signature), "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

const markSubscriptionEndedAtPeriodEnd = async (subPayload, status) => {
  const sub = await Subscription.findOne({ razorpay_subscription_id: subPayload.id }).select("_id");
  if (!sub) return;
  await endSubscription(sub._id, status, subPayload.current_end ? new Date(subPayload.current_end * 1000) : undefined);
};

export const handleRazorpayWebhook = async (req, res) => {
  let eventRecordId;
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!verifySignature(req.body, signature)) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));
    // Razorpay sends the event name in `event` and the unique delivery id in the x-razorpay-event-id header.
    const type = event.event || event.type;
    const { payload } = event;
    const eventId =
      req.headers["x-razorpay-event-id"] ||
      event.id ||
      `${type}-${event.created_at || Date.now()}-${payload?.payment?.entity?.id || payload?.subscription?.entity?.id || crypto.randomUUID()}`;
    if (!type) return res.status(400).send("Missing event type");

    try {
      await WebhookEvent.create({ eventId, type });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(200).send("Duplicate event ignored");
      }
      throw error;
    }
    eventRecordId = eventId;

    if (type === "subscription.activated" || type === "subscription.authenticated") {
      const subPayload = payload.subscription.entity;
      await Subscription.findOneAndUpdate(
        { razorpay_subscription_id: subPayload.id, status: { $in: ["created", "pending"] } },
        {
          status: "authenticated",
          ...(subPayload.current_start ? { current_period_start: new Date(subPayload.current_start * 1000) } : {}),
          ...(subPayload.current_end ? { current_period_end: new Date(subPayload.current_end * 1000) } : {}),
        }
      );
    } else if (type === "subscription.charged") {
      const subPayload = payload.subscription.entity;
      const paymentPayload = payload.payment.entity;
      const sub = await Subscription.findOne({ razorpay_subscription_id: subPayload.id });
      if (sub) {
        try {
          await recordSubscriptionPayment(sub, paymentPayload, {
            periodStart: subPayload.current_start ? new Date(subPayload.current_start * 1000) : undefined,
            periodEnd: subPayload.current_end ? new Date(subPayload.current_end * 1000) : undefined,
            eventId,
          });
        } catch (error) {
          if (error.code !== "PLAN_MISMATCH") throw error;
          console.error("Rejected subscription.charged:", error.message);
          return res.status(200).send("Payment does not match plan; not activated");
        }
      } else {
        console.log(`subscription.charged for unknown subscription: ${subPayload.id}`);
      }
    } else if (type === "subscription.cancelled" || type === "subscription.halted" || type === "subscription.completed") {
      const statusMapping = {
        "subscription.cancelled": "cancelled",
        "subscription.halted": "halted",
        "subscription.completed": "completed",
      };
      await markSubscriptionEndedAtPeriodEnd(payload.subscription.entity, statusMapping[type]);
    } else if (type === "payment.failed") {
      const paymentPayload = payload.payment.entity;
      const subPayload = payload.subscription?.entity;
      const subscriptionId = subPayload?.id || paymentPayload.subscription_id;
      const sub = subscriptionId ? await Subscription.findOne({ razorpay_subscription_id: subscriptionId }) : null;
      if (sub) {
        await Payment.findOneAndUpdate(
          { razorpay_payment_id: paymentPayload.id, status: { $ne: "captured" } },
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
        ).catch((error) => {
          if (error.code !== 11000) throw error;
        });
      } else {
        console.log(`Payment failed for unknown subscription: ${paymentPayload.id}`);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Forget the event so Razorpay's automatic retry is processed instead of being ignored as a duplicate.
    if (eventRecordId) await WebhookEvent.deleteOne({ eventId: eventRecordId }).catch(() => {});
    res.status(500).send("Internal Error");
  }
};
