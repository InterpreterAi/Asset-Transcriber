import { pgTable, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const referralsTable = pgTable("referrals", {
  id:                serial("id").primaryKey(),
  referrerId:        integer("referrer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  clickedAt:         timestamp("clicked_at").notNull().defaultNow(),
  registeredUserId:  integer("registered_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  registeredAt:      timestamp("registered_at"),
  hasStartedSession: boolean("has_started_session").notNull().default(false),
  createdAt:         timestamp("created_at").notNull().defaultNow(),
});

export type Referral = typeof referralsTable.$inferSelect;
