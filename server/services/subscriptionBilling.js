import Subscription from "../models/Subscription.js";
import Payment from "../models/Payment.js";
import User from "../models/auth.js";
import { PLANS } from "../config/plans.js";
import { generateInvoicePdfBuffer } from "../utils/invoicePdf.js";
import { sendSubscriptionEmail } from "../utils/mailer.js";

export const PLAN_FEATURE_TEXT = {
  bronze: ["5 questions per day", "Bronze profile badge", "Advanced search filters"],
  silver: ["15 questions per day", "Silver profile badge", "Priority support", "Enhanced profile visibility", "Unlimited bookmarks"],
  gold: [
    "Unlimited questions",
    "Gold profile badge",
    "Highest search priority",
    "Featured profile visibility",
    "Priority customer support",
    "Exclusive community access",
  ],
};

const invoiceNumberForPayment = (paymentId) =>
  `INV-${new Date().toISOString().split("T")[0].replace(/-/g, "")}-${paymentId}`.toUpperCase();

const mismatch = (message) => Object.assign(new Error(message), { code: "PLAN_MISMATCH" });

export const assertPaymentMatchesPlan = (payment, plan) => {
  const planConfig = PLANS[plan];
  if (!planConfig) throw mismatch(`Unknown plan ${plan}`);
  if (Number(payment.amount) !== planConfig.amountPaise) {
    throw mismatch(`Amount mismatch for ${plan}: received ${payment.amount}, expected ${planConfig.amountPaise}`);
  }
  if ((payment.currency || "").toUpperCase() !== planConfig.currency) {
    throw mismatch(`Currency mismatch for ${plan}: received ${payment.currency}`);
  }
};

// Activates the subscription for a captured payment, records it with a unique invoice and emails the invoice.
// Safe to call from both the webhook and the reconcile endpoint: the unique razorpay_payment_id index makes
// sure only the first caller creates the invoice and sends the email.
export const recordSubscriptionPayment = async (sub, payment, { periodStart, periodEnd, eventId } = {}) => {
  assertPaymentMatchesPlan(payment, sub.plan);

  const activated = await Subscription.findByIdAndUpdate(
    sub._id,
    {
      status: "active",
      ...(periodStart ? { current_period_start: periodStart } : {}),
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
    },
    { new: true }
  );
  await User.findByIdAndUpdate(sub.userId, { plan: sub.plan, activeSubscriptionId: sub._id });

  let newPayment;
  try {
    newPayment = await Payment.create({
      userId: sub.userId,
      subscriptionId: sub._id,
      razorpay_event_id: eventId,
      razorpay_payment_id: payment.id,
      transaction_id: payment.id,
      plan: sub.plan,
      amount: payment.amount,
      currency: payment.currency,
      status: "captured",
      payment_method: payment.method,
      billing_period_start: activated.current_period_start,
      billing_period_end: activated.current_period_end,
      invoice_number: invoiceNumberForPayment(payment.id),
    });
  } catch (error) {
    if (error.code === 11000) return { created: false };
    throw error;
  }

  const user = await User.findById(sub.userId);
  if (user) {
    const pdfBuffer = await generateInvoicePdfBuffer(newPayment, user, { name: sub.plan.toUpperCase() });
    const planConfig = PLANS[sub.plan];
    const sent = await sendSubscriptionEmail(user.email, sub.plan.toUpperCase(), newPayment.invoice_number, pdfBuffer, {
      amount: `${planConfig.currency} ${(newPayment.amount / 100).toFixed(2)} / month`,
      periodEnd: activated.current_period_end ? activated.current_period_end.toDateString() : undefined,
      features: PLAN_FEATURE_TEXT[sub.plan],
    });
    if (sent) {
      newPayment.invoice_email_sent_at = new Date();
      await newPayment.save();
    }
  }
  return { created: true, payment: newPayment };
};

// Pulls the subscription's paid invoices straight from Razorpay and records any payment we have not seen yet.
// This makes activation, invoices and the confirmation email work even when the webhook is not configured
// or arrives late.
export const syncPaymentsFromRazorpay = async (rzp, sub) => {
  const invoices = await rzp.invoices.all({ subscription_id: sub.razorpay_subscription_id });
  let recorded = 0;
  for (const invoice of invoices?.items || []) {
    if (invoice.status !== "paid" || !invoice.payment_id) continue;
    if (await Payment.exists({ razorpay_payment_id: invoice.payment_id })) continue;
    const payment = await rzp.payments.fetch(invoice.payment_id);
    if (payment.status !== "captured") continue;
    const result = await recordSubscriptionPayment(sub, payment, {
      periodStart: invoice.billing_start ? new Date(invoice.billing_start * 1000) : undefined,
      periodEnd: invoice.billing_end ? new Date(invoice.billing_end * 1000) : undefined,
    });
    if (result.created) recorded += 1;
  }
  return recorded;
};
