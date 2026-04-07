import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralsTable = pgTable("referrals", {
  id:             serial("id").primaryKey(),
  referrerUserId: integer("referrer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  referredUserId: integer("referred_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status:         text("status").notNull().default("pending"),
  sessionsCount:  integer("sessions_count").notNull().default(0),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
