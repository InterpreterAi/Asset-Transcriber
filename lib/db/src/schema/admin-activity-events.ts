import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Lightweight audit rows surfaced in Admin → Monitor → system events. */
export const adminActivityEventsTable = pgTable("admin_activity_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  detail: text("detail"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminActivityEvent = typeof adminActivityEventsTable.$inferSelect;
