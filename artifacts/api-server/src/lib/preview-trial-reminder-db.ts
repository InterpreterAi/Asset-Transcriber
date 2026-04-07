/**
 * DB-only preview for trial reminder campaigns.
 * Run: cd artifacts/api-server && node --import tsx ./src/lib/preview-trial-reminder-db.ts
 */
import { logger } from "./logger.js";
import { printTrialReminderDbReport } from "./trial-reminder-db-report.js";

void printTrialReminderDbReport()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "preview-trial-reminder-db: failed");
    console.error(err);
    process.exit(1);
  });
