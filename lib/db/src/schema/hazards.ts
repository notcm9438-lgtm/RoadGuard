import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const hazardsTable = pgTable("hazards", {
  id: serial("id").primaryKey(),
  hazardType: text("hazard_type").notNull(),
  location: text("location").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  imageUrl: text("image_url"),
  damagePercentage: integer("damage_percentage").notNull(),
  riskScore: integer("risk_score").notNull(),
  riskLevel: text("risk_level").notNull(),
  description: text("description").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  responsibleAuthority: text("responsible_authority").notNull(),
  status: text("status").notNull().default("OPEN"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertHazardSchema = createInsertSchema(hazardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertHazard = z.infer<typeof insertHazardSchema>;
export type Hazard = typeof hazardsTable.$inferSelect;