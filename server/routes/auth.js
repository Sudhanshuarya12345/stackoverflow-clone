import express from "express";
import {
  getallusers,
  getMe,
  getUserProfile,
  Login,
  Logout,
  resendLoginOtp,
  Signup,
  updateprofile,
  forgotPassword,
  resendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  verifyLoginOtp,
} from "../controller/auth.js";
import {
  getMyLoginHistory,
  getSessions,
  getTrustedDevices,
  removeTrustedDevice,
  requestLanguageChange,
  resendLanguageOtp,
  revokeOtherSessions,
  revokeSession,
  verifyLanguageChange,
} from "../controller/security.js";
import { getMyTransfers, getReputationHistory, getReputationRules, transferReputation } from "../controller/reputation.js";
import auth from "../middleware/auth.js";
import optionalAuth from "../middleware/optionalAuth.js";
import requireActiveUser from "../middleware/requireActiveUser.js";

const router = express.Router();
router.post("/signup", Signup);
router.post("/login", Login);
router.post("/login/verify-otp", verifyLoginOtp);
router.post("/login/resend-otp", resendLoginOtp);
router.post("/logout", auth, Logout);
router.post("/forgot-password", forgotPassword);
router.post("/forgot-password/verify", verifyForgotPasswordOtp);
router.post("/forgot-password/resend", resendForgotPasswordOtp);
router.get("/me", auth, getMe);
router.get("/getalluser", getallusers);
router.get("/profile/:id", optionalAuth, getUserProfile);
router.patch("/update/:id", auth, updateprofile);

router.get("/sessions", auth, getSessions);
router.delete("/sessions/:id", auth, revokeSession);
router.post("/sessions/revoke-others", auth, revokeOtherSessions);
router.get("/trusted-devices", auth, getTrustedDevices);
router.delete("/trusted-devices/:id", auth, removeTrustedDevice);
router.get("/login-history", auth, getMyLoginHistory);

router.post("/language/request", auth, requestLanguageChange);
router.post("/language/verify", auth, verifyLanguageChange);
router.post("/language/resend", auth, resendLanguageOtp);

router.get("/reputation/rules", getReputationRules);
router.get("/reputation/transfers", auth, getMyTransfers);
router.post("/reputation/transfer", auth, requireActiveUser, transferReputation);
router.get("/:id/reputation", getReputationHistory);
export default router;
