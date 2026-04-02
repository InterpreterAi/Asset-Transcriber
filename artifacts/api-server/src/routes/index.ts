import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import transcriptionRouter from "./transcription.js";
import usageRouter from "./usage.js";
import feedbackRouter from "./feedback.js";
import adminRouter from "./admin.js";
import translateRouter from "./translate.js";
import stripeRouter from "./stripe.js";
import supportRouter from "./support.js";
import glossaryRouter from "./glossary.js";
import terminologyRouter from "./terminology.js";
import referralsRouter from "./referrals.js";
import shareRouter from "./share.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/transcription", transcriptionRouter);
router.use("/usage", usageRouter);
router.use("/feedback", feedbackRouter);
router.use("/admin", adminRouter);
router.use("/translate", translateRouter);
router.use("/stripe", stripeRouter);
router.use("/support", supportRouter);
router.use("/glossary", glossaryRouter);
router.use("/terminology", terminologyRouter);
router.use("/referrals", referralsRouter);
router.use("/share", shareRouter);

export default router;
