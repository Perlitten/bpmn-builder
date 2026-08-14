import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const processes = pgTable("processes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  bpmnXml: text("bpmn_xml").notNull(),
  workflowJson: text("workflow_json"),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
