import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Emails that have already received a free trial (survives account deletion). */
export const trialConsumedEmailsTable = pgTable("trial_consumed_emails", {
  email: text("email").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
