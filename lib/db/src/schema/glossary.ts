import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const glossaryEntriesTable = pgTable("glossary_entries", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  term:        text("term").notNull(),
  translation: text("translation").notNull(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type GlossaryEntry = typeof glossaryEntriesTable.$inferSelect;
