import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";
import { hazardsTable } from "./hazards";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reportNumber: text("report_number").notNull().unique(),
  hazardId: integer("hazard_id")
    .notNull()
    .references(() => hazardsTable.id, { onDelete: "cascade" }),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  status: text("status").notNull().default("GENERATED"),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  generatedAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;