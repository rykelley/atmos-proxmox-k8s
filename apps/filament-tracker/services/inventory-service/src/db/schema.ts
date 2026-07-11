import {
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  date,
} from "drizzle-orm/pg-core";

// This service owns the `inventory` schema. Material/brand/color are stored as
// denormalized strings (loose coupling) - the catalog service is the source of
// truth for the reference lists, but inventory does not FK across services.
export const inventory = pgSchema("inventory");

export const spools = inventory.table("spools", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  material: text("material").notNull(),
  colorName: text("color_name"),
  colorHex: text("color_hex").notNull().default("#8b5cf6"),
  diameterMm: numeric("diameter_mm", { precision: 4, scale: 2 }).notNull().default("1.75"),
  totalWeightG: integer("total_weight_g").notNull().default(1000),
  remainingWeightG: integer("remaining_weight_g").notNull().default(1000),
  spoolWeightG: integer("spool_weight_g").notNull().default(0),
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  vendor: text("vendor"),
  purchasedAt: date("purchased_at"),
  location: text("location"),
  inDrybox: boolean("in_drybox").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usageLog = inventory.table("usage_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  spoolId: uuid("spool_id")
    .notNull()
    .references(() => spools.id, { onDelete: "cascade" }),
  gramsUsed: integer("grams_used").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Spool = typeof spools.$inferSelect;
export type UsageEntry = typeof usageLog.$inferSelect;
