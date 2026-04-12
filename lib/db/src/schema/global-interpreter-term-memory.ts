import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Crowdsourced terminology memory (no transcript/PHI): English surface form → target-language
 * gloss learned when post-processing fixes a Latin leak in non-English output. Shared by all users
 * for consistent medical/legal MT+OpenAI hints on the same pair.
 */
export const globalInterpreterTermMemoryTable = pgTable(
  "global_interpreter_term_memory",
  {
    id: serial("id").primaryKey(),
    sourceBase: text("source_base").notNull(),
    targetBase: text("target_base").notNull(),
    sourceTermNorm: text("source_term_norm").notNull(),
    targetTranslation: text("target_translation").notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    globalInterpTermUniq: uniqueIndex("global_interpreter_term_memory_uniq").on(
      t.sourceBase,
      t.targetBase,
      t.sourceTermNorm,
    ),
  }),
);

export type GlobalInterpreterTermMemory = typeof globalInterpreterTermMemoryTable.$inferSelect;
