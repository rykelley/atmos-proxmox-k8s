import { pgSchema, uuid, text, timestamp } from "drizzle-orm/pg-core";

// This service owns the `catalog` schema. Other services never touch these
// tables directly - they consume them over HTTP.
export const catalog = pgSchema("catalog");

export const materials = catalog.table("materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const brands = catalog.table("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  website: text("website"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const colors = catalog.table("colors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  hex: text("hex").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Material = typeof materials.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Color = typeof colors.$inferSelect;
