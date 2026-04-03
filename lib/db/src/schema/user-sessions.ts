import { pgTable, varchar, json, timestamp } from "drizzle-orm/pg-core";

/**
 * express-session + connect-pg-simple store (when SESSION_STORE=postgres).
 * Matches connect-pg-simple default shape: sid, sess, expire.
 */
export const userSessionsTable = pgTable("user_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
});
