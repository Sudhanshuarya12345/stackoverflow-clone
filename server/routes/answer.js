import express from "express";
import { Askanswer, deleteanswer } from "../controller/answer.js";

import auth from "../middleware/auth.js";
import requireActiveUser from "../middleware/requireActiveUser.js";

const router = express.Router();

router.post("/postanswer/:id", auth, requireActiveUser, Askanswer);
router.delete("/delete/:id",auth,deleteanswer)


export default router;
