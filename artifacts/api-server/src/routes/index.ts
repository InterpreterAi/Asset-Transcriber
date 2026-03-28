import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import transcriptionRouter from "./transcription.js";
import usageRouter from "./usage.js";
import feedbackRouter from "./feedback.js";
import adminRouter from "./admin.js";
import translateRouter from "./translate.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/transcription", transcriptionRouter);
router.use("/usage", usageRouter);
router.use("/feedback", feedbackRouter);
router.use("/admin", adminRouter);
router.use("/translate", translateRouter);

export default router;
