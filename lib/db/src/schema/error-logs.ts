import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const errorLogsTable = pgTable("error_logs", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sessionId:    text("session_id"),
  endpoint:     text("endpoint").notNull(),
  method:       text("method").notNull().default("GET"),
  statusCode:   integer("status_code").notNull(),
  errorType:    text("error_type").notNull(),
  errorMessage: text("error_message"),
  userAgent:    text("user_agent"),
  ipAddress:    text("ip_address"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export type ErrorLog = typeof errorLogsTable.$inferSelect;
