import mongoose from "mongoose";
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

// Confirmation workflow for a captured payment:
//  1. ONE database transaction activates the subscription, upgrades the user's plan, records the payment and
//     issues the invoice (number + rendered PDF stored on the payment). If any step fails - including PDF
//     generation - the transaction aborts and nothing is activated; the webhook answers 500 so Razorpay retries,
//     and the reconcile endpoint retries too.
//  2. The same transaction queues the confirmation email (the payment row is the outbox entry). An email cannot
//     be part of a database transaction and a paid upgrade must not depend on the mail server being up, so the
//     email is delivered right after commit and retried with backoff until it is sent. Delivery status is shown
//     on the billing dashboard, where the user can also resend it.
// Safe to call from both the webhook and the reconcile endpoint: the unique razorpay_payment_id index makes
// sure only the first caller records the payment.
export const recordSubscriptionPayment = async (sub, payment, { periodStart, periodEnd, eventId } = {}) => {
  assertPaymentMatchesPlan(payment, sub.plan);

  const session = await mongoose.startSession();
  let newPayment = null;
  try {
    await session.withTransaction(async () => {
      newPayment = null;
      if (await Payment.exists({ razorpay_payment_id: payment.id }).session(session)) return;

      const user = await User.findById(sub.userId).select("name email billingDetails").session(session);
      if (!user) throw new Error(`User ${sub.userId} not found`);
      const activated = await Subscription.findByIdAndUpdate(
        sub._id,
        {
          status: "active",
          ...(periodStart ? { current_period_start: periodStart } : {}),
          ...(periodEnd ? { current_period_end: periodEnd } : {}),
        },
        { new: true, session }
      );
      if (!activated) throw new Error(`Subscription ${sub._id} not found`);
      await User.updateOne({ _id: sub.userId }, { plan: sub.plan, activeSubscriptionId: sub._id }, { session });

      const record = new Payment({
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
        invoice_issued_at: new Date(),
      });
      record.invoice_pdf = await generateInvoicePdfBuffer(record, user, { name: String(sub.plan).toUpperCase() });
      await record.save({ session });
      newPayment = record;
    });
  } catch (error) {
    // A concurrent caller (webhook vs reconcile) recorded the same payment first.
    if (error.code === 11000) return { created: false };
    throw error;
  } finally {
    await session.endSession();
  }

  if (!newPayment) return { created: false };
  await deliverInvoiceEmail(newPayment._id);
  return { created: true, payment: newPayment };
};

const MAX_AUTOMATIC_EMAIL_ATTEMPTS = 10;
const INVOICE_EMAIL_LEASE_MS = 2 * 60 * 1000;
// 1 min, 2 min, 4 min ... capped at 6 h, so a mail outage of more than a day is covered automatically.
const retryDelayMs = (attempts) => Math.min(60 * 1000 * 2 ** Math.max(0, attempts - 1), 6 * 60 * 60 * 1000);

export const invoiceEmailStatus = (payment) => {
  if (payment.status !== "captured") return undefined;
  if (payment.invoice_email_sent_at) return "sent";
  return (payment.invoice_email_attempts || 0) >= MAX_AUTOMATIC_EMAIL_ATTEMPTS ? "failed" : "pending";
};

// Emails the stored invoice PDF with the plan details. Never throws: a failure schedules the next attempt,
// picked up by retryPendingInvoiceEmails(). `invoice_email_next_attempt_at` doubles as a lease so the webhook,
// the reconcile endpoint and the retry job never send the same email twice. `resend` (user-triggered from the
// billing dashboard) also works for emails already delivered or past the automatic attempt limit.
export const deliverInvoiceEmail = async (paymentId, { resend = false, userId } = {}) => {
  const now = new Date();
  const claimed = await Payment.findOneAndUpdate(
    {
      _id: paymentId,
      ...(userId ? { userId } : {}),
      status: "captured",
      ...(resend ? {} : { invoice_email_sent_at: null, invoice_email_attempts: { $not: { $gte: MAX_AUTOMATIC_EMAIL_ATTEMPTS } } }),
      $or: [{ invoice_email_next_attempt_at: null }, { invoice_email_next_attempt_at: { $lte: now } }],
    },
    {
      $set: { invoice_email_next_attempt_at: new Date(now.getTime() + INVOICE_EMAIL_LEASE_MS) },
      ...(resend ? {} : { $inc: { invoice_email_attempts: 1 } }),
    },
    { new: true }
  ).select("+invoice_pdf");
  if (!claimed) return false;

  let errorMessage = "Email provider rejected the message";
  try {
    const user = await User.findById(claimed.userId).select("name email language billingDetails");
    if (!user?.email) throw new Error("User has no email address");
    const planName = String(claimed.plan || "").toUpperCase();
    const planConfig = PLANS[claimed.plan];
    // Invoices recorded before PDFs were stored are rendered on demand.
    const pdfBuffer = claimed.invoice_pdf?.length ? claimed.invoice_pdf : await generateInvoicePdfBuffer(claimed, user, { name: planName });
    const sent = await sendSubscriptionEmail(user.email, planName, claimed.invoice_number, pdfBuffer, {
      amount: `${planConfig?.currency || claimed.currency} ${(claimed.amount / 100).toFixed(2)}`,
      periodEnd: claimed.billing_period_end || undefined,
      features: PLAN_FEATURE_TEXT[claimed.plan],
      lang: user.language,
    });
    if (sent) {
      await Payment.updateOne(
        { _id: claimed._id },
        { $set: { invoice_email_sent_at: new Date() }, $unset: { invoice_email_next_attempt_at: "", invoice_email_last_error: "" } }
      );
      return true;
    }
  } catch (error) {
    errorMessage = error.message;
  }
  console.error(`Invoice email for payment ${claimed._id} failed (attempt ${claimed.invoice_email_attempts}):`, errorMessage);
  await Payment.updateOne(
    { _id: claimed._id },
    {
      $set: {
        invoice_email_last_error: errorMessage,
        invoice_email_next_attempt_at: new Date(Date.now() + (resend ? 0 : retryDelayMs(claimed.invoice_email_attempts))),
      },
    }
  );
  return false;
};

// Delivers confirmation emails that are still queued (mail outage, server restart between commit and send).
// Runs on a timer from index.js and for the current user whenever their subscription is reconciled.
export const retryPendingInvoiceEmails = async ({ userId, limit = 25 } = {}) => {
  const now = new Date();
  const pending = await Payment.find({
    ...(userId ? { userId } : {}),
    status: "captured",
    invoice_email_sent_at: null,
    invoice_email_attempts: { $not: { $gte: MAX_AUTOMATIC_EMAIL_ATTEMPTS } },
    $or: [{ invoice_email_next_attempt_at: null }, { invoice_email_next_attempt_at: { $lte: now } }],
    // Only recent payments: never email a stale invoice for an old payment recorded before delivery was tracked.
    createdAt: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .select("_id");
  let delivered = 0;
  for (const { _id } of pending) {
    if (await deliverInvoiceEmail(_id)) delivered += 1;
  }
  return delivered;
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
