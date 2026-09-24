import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import userroutes from "./routes/auth.js"
import questionroute from "./routes/question.js"
import answerroutes from "./routes/answer.js"
import webhookroute from "./routes/webhook.js"
import subscriptionroutes from "./routes/subscription.js"
import communityroutes from "./routes/community.js"
import supportroutes from "./routes/support.js"
import notificationroutes from "./routes/notification.js"
import adminroutes from "./routes/admin.js"
import { expireDueSubscriptions } from "./services/subscriptionAccess.js";
import { expireOldBounties } from "./controller/question.js";
const app = express();
dotenv.config();

// Webhook mounted BEFORE json body parser with raw expression
app.use('/api/webhooks', express.raw({type: 'application/json'}), webhookroute);

app.use(express.json({ limit: "30mb", extended: true }));
app.use(express.urlencoded({ limit: "30mb", extended: true }));
app.use(cors());
app.get("/", (req, res) => {
  res.send("Stackoverflow clone is running perfect");
});
app.use('/user',userroutes)
app.use('/question',questionroute)
app.use('/answer',answerroutes)
app.use('/api/subscriptions', subscriptionroutes)
app.use('/api/community', communityroutes)
app.use('/api/support', supportroutes)
app.use('/api/notifications', notificationroutes)
app.use('/api/admin', adminroutes)
const PORT = process.env.PORT || 5000;
const databaseurl = process.env.MONGODB_URL;

mongoose
  .connect(databaseurl, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
setInterval(async () => {
      try {
        await expireDueSubscriptions();
      } catch (error) {
        console.error("Subscription expiry job failed:", error);
      }
      try {
        await expireOldBounties();
      } catch (error) {
        console.error("Bounty expiry job failed:", error);
      }
    }, 60 * 60 * 1000);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });



  app.use((req, res) => {
    console.log("❌ UNMATCHED ROUTE:", req.method, req.originalUrl);
    res.status(404).json({
      message: "Route not found",
      method: req.method,
      path: req.originalUrl
    });
  });