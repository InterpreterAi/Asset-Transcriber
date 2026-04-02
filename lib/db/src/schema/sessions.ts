import { pgTable, serial, integer, timestamp, text, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const sessionsTable = pgTable("sessions", {
  id:              serial("id").primaryKey(),
  userId:          integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  startedAt:       timestamp("started_at").notNull().defaultNow(),
  endedAt:         timestamp("ended_at"),
  durationSeconds: integer("duration_seconds"),
  lastActivityAt:  timestamp("last_activity_at"),
  langPair:        text("lang_pair"),

  // ── Real API-usage cost tracking ──────────────────────────────────────────
  // Soniox: audio seconds are the session's durationSeconds (audio goes browser→Soniox directly).
  // OpenAI: tokens are accumulated incrementally after each /translate call.
  audioSecondsProcessed: integer("audio_seconds_processed").default(0),
  sonioxCost:            numeric("soniox_cost",        { precision: 10, scale: 6 }).default("0"),
  translationTokens:     integer("translation_tokens").default(0),
  translationCost:       numeric("translation_cost",   { precision: 10, scale: 6 }).default("0"),
  totalSessionCost:      numeric("total_session_cost", { precision: 10, scale: 6 }).default("0"),
});

export type Session = typeof sessionsTable.$inferSelect;
