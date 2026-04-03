import {
  pgTable,
  serial,
  integer,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Optional OAuth account links (NextAuth-style). The app uses `users.google_account_id` for Google;
 * this table exists so Drizzle push creates a standard `accounts` relation if you extend auth later.
 */
export const accountsTable = pgTable(
  "accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("oauth"),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (t) => ({
    accountsProviderIdx: uniqueIndex("accounts_provider_provider_account_id_uid").on(
      t.provider,
      t.providerAccountId,
    ),
  }),
);
