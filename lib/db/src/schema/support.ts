import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const supportTicketsTable = pgTable("support_tickets", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  email:     text("email").notNull(),
  subject:   text("subject").notNull(),
  message:   text("message").notNull(),
  status:    text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const supportRepliesTable = pgTable("support_replies", {
  id:        serial("id").primaryKey(),
  ticketId:  integer("ticket_id").notNull().references(() => supportTicketsTable.id, { onDelete: "cascade" }),
  authorId:  integer("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  isAdmin:   boolean("is_admin").notNull().default(false),
  message:   text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
export type SupportReply  = typeof supportRepliesTable.$inferSelect;
