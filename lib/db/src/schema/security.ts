import { pgTable, serial, integer, text, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";

// No foreign keys to users: creating these at boot must never lock the live users table.

export const securityIpSightingsTable = pgTable(
  "security_ip_sightings",
  {
    id:        serial("id").primaryKey(),
    userId:    integer("user_id").notNull(),
    ipAddress: text("ip_address").notNull(),
    userAgent: text("user_agent"),
    uaHash:    text("ua_hash").notNull(),
    firstSeen: timestamp("first_seen").notNull().defaultNow(),
    lastSeen:  timestamp("last_seen").notNull().defaultNow(),
    hits:      integer("hits").notNull().default(1),
  },
  (t) => [
    uniqueIndex("security_ip_sightings_user_ip_ua_uidx").on(t.userId, t.ipAddress, t.uaHash),
    index("security_ip_sightings_last_seen_idx").on(t.lastSeen),
  ],
);

export const securityIpGeoTable = pgTable("security_ip_geo", {
  ip:         text("ip").primaryKey(),
  city:       text("city"),
  region:     text("region"),
  country:    text("country"),
  org:        text("org"),
  isVpn:      boolean("is_vpn").notNull().default(false),
  lookedUpAt: timestamp("looked_up_at").notNull().defaultNow(),
});

export const securityAlertsTable = pgTable(
  "security_alerts",
  {
    id:              serial("id").primaryKey(),
    pairKey:         text("pair_key").notNull(),
    olderUserId:     integer("older_user_id").notNull(),
    newerUserId:     integer("newer_user_id").notNull(),
    score:           integer("score").notNull(),
    confidence:      text("confidence").notNull(),
    status:          text("status").notNull().default("open"),
    report:          jsonb("report").notNull(),
    firstDetectedAt: timestamp("first_detected_at").notNull().defaultNow(),
    updatedAt:       timestamp("updated_at").notNull().defaultNow(),
    emailedAt:       timestamp("emailed_at"),
    resolvedAt:      timestamp("resolved_at"),
  },
  (t) => [uniqueIndex("security_alerts_pair_key_uidx").on(t.pairKey)],
);

export type SecurityAlert = typeof securityAlertsTable.$inferSelect;
