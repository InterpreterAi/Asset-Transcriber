import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const loginEventsTable = pgTable("login_events", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  email:         text("email"),
  ipAddress:     text("ip_address"),
  userAgent:     text("user_agent"),
  success:       boolean("success").notNull(),
  failureReason: text("failure_reason"),
  is2fa:         boolean("is_2fa").notNull().default(false),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
});

export type LoginEvent = typeof loginEventsTable.$inferSelect;
