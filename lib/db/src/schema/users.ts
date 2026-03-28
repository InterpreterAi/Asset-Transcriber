import { pgTable, serial, text, boolean, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  trialStartedAt: timestamp("trial_started_at").notNull().defaultNow(),
  trialEndsAt: timestamp("trial_ends_at").notNull(),
  dailyLimitMinutes: integer("daily_limit_minutes").notNull().default(180),
  minutesUsedToday: real("minutes_used_today").notNull().default(0),
  totalMinutesUsed: real("total_minutes_used").notNull().default(0),
  totalSessions: integer("total_sessions").notNull().default(0),
  lastUsageResetAt: timestamp("last_usage_reset_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
