import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const glossaryEntriesTable = pgTable(
  "glossary_entries",
  {
    id:           serial("id").primaryKey(),
    userId:       integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    term:         text("term").notNull(),
    translation:  text("translation").notNull(),
    /** Post-process enforcement vs prompt-only hints. */
    enforceMode:  text("enforce_mode").notNull().default("strict"),
    /** Higher runs first when applying strict rules (tie-break after source match length). */
    priority:     integer("priority").notNull().default(0),
    createdAt:    timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userTermUniq: uniqueIndex("glossary_entries_user_id_term_uidx").on(t.userId, t.term),
  }),
);

export type GlossaryEntry = typeof glossaryEntriesTable.$inferSelect;
