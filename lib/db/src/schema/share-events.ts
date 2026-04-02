import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const shareEventsTable = pgTable("share_events", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform:  text("platform").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ShareEvent = typeof shareEventsTable.$inferSelect;
