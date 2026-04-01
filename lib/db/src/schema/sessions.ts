import { pgTable, serial, integer, timestamp, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const sessionsTable = pgTable("sessions", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  startedAt:       timestamp("started_at").notNull().defaultNow(),
  endedAt:         timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  lastActivityAt:  timestamp("last_activity_at"),
  langPair:        text("lang_pair"),
});

export type Session = typeof sessionsTable.$inferSelect;
