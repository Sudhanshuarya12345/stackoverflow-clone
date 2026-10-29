// Finds subscriptions that are marked active but have no captured payment with an issued invoice. Since the plan
// check requires that invoice, these users are shown the free plan until the payment is recorded.
// Read-only by default:          node scripts/audit-subscriptions.js
// Record the missing payments:   node scripts/audit-subscriptions.js --repair
// --repair pulls each subscription's paid invoices from Razorpay and records them through the normal confirmation
// workflow (payment + invoice + activation in one transaction), which also emails the user their invoice.
import dotenv from "dotenv";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Subscription from "../models/Subscription.js";
import User from "../models/auth.js";
import { hasIssuedInvoice, refreshUserPlanFromSubscription } from "../services/subscriptionAccess.js";
import { syncPaymentsFromRazorpay } from "../services/subscriptionBilling.js";

dotenv.config();
const repair = process.argv.includes("--repair");

await mongoose.connect(process.env.MONGODB_URL);
try {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  console.log(hello.setName ? `✓ Replica set "${hello.setName}": transactions are supported.` : "✗ Standalone server: transactions will FAIL.");

  const subs = await Subscription.find({ status: { $in: ["active", "cancellation_pending"] } }).sort({ createdAt: 1 });
  const affected = [];
  for (const sub of subs) {
    if (!(await hasIssuedInvoice(sub._id))) affected.push(sub);
  }
  console.log(`${subs.length} active/cancelling subscription(s), ${affected.length} without an issued invoice.`);

  const rzp = repair ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET }) : null;
  for (const sub of affected) {
    const user = await User.findById(sub.userId).select("email plan");
    const periodEnd = sub.current_period_end ? sub.current_period_end.toISOString().slice(0, 10) : "none";
    console.log(`- ${sub.razorpay_subscription_id || sub._id}  ${sub.plan}  status=${sub.status}  ends=${periodEnd}  user=${user?.email || sub.userId} (plan now: ${user?.plan})`);
    if (!rzp || !sub.razorpay_subscription_id) continue;
    try {
      const recorded = await syncPaymentsFromRazorpay(rzp, sub);
      await refreshUserPlanFromSubscription(sub.userId);
      console.log(recorded ? `    repaired: recorded ${recorded} payment(s)` : "    no paid invoice found at Razorpay; left as is");
    } catch (error) {
      console.log(`    repair failed: ${error.message}`);
    }
  }
  if (affected.length && !repair) console.log("Run again with --repair to record these payments from Razorpay.");
} finally {
  await mongoose.disconnect();
}
