import { Router } from "express";
import { db, feedbackTable, usersTable, sessionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { sendTelegramNotification } from "../lib/telegram.js";
import {
  hasMandatoryFeedbackGateSatisfied,
  isMandatoryFeedbackEligible,
  isMandatoryFeedbackRequiredByUsageWithLive,
  isMandatoryFeedbackRequiredByUsage,
  isPaidPostSessionFeedbackEligible,
  isPaidPostSessionFeedbackRequiredByUsage,
  MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH,
  MANDATORY_FEEDBACK_SOURCE,
  PAID_POST_SESSION_FEEDBACK_SOURCE,
} from "../lib/feedback-gate.js";
import { getUserWithResetCheck } from "../lib/usage.js";

function feedbackGateBypassedForAdmin(user: { isAdmin?: boolean | null }): boolean {
  return user.isAdmin === true;
}

const router = Router();

const STAR_LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
const RECOMMEND_EMOJI: Record<string, string> = { yes: "👍", no: "👎", maybe: "🤷" };

async function sumOpenSessionsBillableMinutes(userId: number): Promise<number> {
  const rows = await db
    .select({ sec: sessionsTable.audioSecondsProcessed })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.endedAt)));
  let totalSec = 0;
  for (const r of rows) totalSec += Math.max(0, Number(r.sec ?? 0));
  return totalSec / 60;
}

router.get("/status", requireAuth, async (req, res) => {
  const user = await getUserWithResetCheck(req.session.userId!);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const liveOpenMinutes = await sumOpenSessionsBillableMinutes(user.id);

  const gateSatisfied =
    feedbackGateBypassedForAdmin(user) || (await hasMandatoryFeedbackGateSatisfied(user.id));

  const trialUsageRequires =
    isMandatoryFeedbackEligible(user) &&
    isMandatoryFeedbackRequiredByUsageWithLive(user, liveOpenMinutes);
  const trialRequired = trialUsageRequires && !gateSatisfied;
  const trialSubmitted = trialUsageRequires && gateSatisfied;

  const paidUsageRequires =
    isPaidPostSessionFeedbackEligible(user) &&
    liveOpenMinutes < 1e-6 &&
    isPaidPostSessionFeedbackRequiredByUsage(user);
  const paidRequired = paidUsageRequires && !gateSatisfied;
  const paidSubmitted = paidUsageRequires && gateSatisfied;

  res.json({
    required: trialRequired,
    submitted: trialSubmitted,
    paidPostSession: { required: paidRequired, submitted: paidSubmitted },
    source: MANDATORY_FEEDBACK_SOURCE,
  });
});

router.post("/", requireAuth, async (req, res) => {
  const { rating, comment, recommend, source } = req.body as {
    rating?: number; comment?: string; recommend?: string; source?: string;
  };
  if (!rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }
  if (recommend && !["yes", "no", "maybe"].includes(recommend)) {
    res.status(400).json({ error: "Invalid recommend value" });
    return;
  }
  if (
    source === MANDATORY_FEEDBACK_SOURCE ||
    source === PAID_POST_SESSION_FEEDBACK_SOURCE
  ) {
    if ((comment?.trim().length ?? 0) < MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH) {
      res.status(400).json({
        error: `Comment must be at least ${MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH} characters for required feedback`,
      });
      return;
    }
  }

  const userId = req.session.userId!;
  const userFull = await getUserWithResetCheck(userId);
  if (!userFull) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [submitter] = await db
    .select({ username: usersTable.username, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  const submitterEmail = submitter?.email?.trim().toLowerCase() ?? null;

  const commentLen = comment?.trim().length ?? 0;
  let resolvedSource: string | null =
    typeof source === "string" && source.trim() ? source.trim() : null;
  if (
    source === PAID_POST_SESSION_FEEDBACK_SOURCE &&
    commentLen >= MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH
  ) {
    resolvedSource = PAID_POST_SESSION_FEEDBACK_SOURCE;
  } else if (
    isMandatoryFeedbackRequiredByUsage(userFull) &&
    commentLen >= MANDATORY_FEEDBACK_MIN_COMMENT_LENGTH
  ) {
    resolvedSource = MANDATORY_FEEDBACK_SOURCE;
  }

  await db.insert(feedbackTable).values({
    userId,
    email:     submitterEmail,
    rating,
    recommend: recommend ?? null,
    comment:   comment?.trim() || null,
    source:    resolvedSource,
  });

  const user = submitter;

  const stars = "⭐".repeat(rating);
  const recLine = recommend ? `Recommend: ${RECOMMEND_EMOJI[recommend]} ${recommend}` : "";
  const srcLine = resolvedSource ? `Source: ${resolvedSource}` : "";
  void sendTelegramNotification(
    [
      `${stars} New ${STAR_LABELS[rating]} Rating`,
      `From: ${user?.username ?? "unknown"}`,
      recLine,
      srcLine,
      comment?.trim() ? `Comment: ${comment.trim().substring(0, 300)}` : "No comment",
    ].filter(Boolean).join("\n"),
  );

  res.json({ message: "Feedback submitted. Thank you!" });
});

export default router;
