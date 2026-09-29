import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  referenceNumber: text("reference_number").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  location: text("location").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  hazardType: text("hazard_type").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url"),
  responsibleAuthority: text("responsible_authority").notNull(),
  status: text("status").notNull().default("SUBMITTED"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertComplaintSchema = createInsertSchema(complaintsTable).omit({
  id: true,
  referenceNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertComplaint = z.infer<typeof insertComplaintSchema>;
export type Complaint = typeof complaintsTable.$inferSelect;