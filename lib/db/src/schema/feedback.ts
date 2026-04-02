import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const feedbackTable = pgTable("feedback", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  rating:    integer("rating").notNull(),
  recommend: text("recommend"),
  comment:   text("comment"),
  source:    text("source"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
