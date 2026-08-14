import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const processes = sqliteTable("processes", {
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
