import { eq, sql } from 'drizzle-orm';
import { bpmnToWorkflow } from '@bpmn/bpmn-adapter';
import { getProcessesTable, getQueryDb } from '@bpmn/db';
import { DEFAULT_BPMN_XML } from './defaultBpmn.js';

/**
 * Processes are owned by a signed-in Google user.
 * Existing rows without `user_id` stay in sqlite as orphans and are never listed.
 * Do not insert unowned demo diagrams — they would be invisible after auth.
 */
export async function seedIfEmpty(): Promise<void> {}

export async function repairEmptyDiagrams(): Promise<void> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const rows = (await db
    .select({ id: table.id, bpmnXml: table.bpmnXml })
    .from(table)
    .where(sql`trim(${table.bpmnXml}) = ''`)) as {
    id: string;
    bpmnXml: string;
  }[];
  const workflowJson = JSON.stringify(await bpmnToWorkflow(DEFAULT_BPMN_XML));
  const now = new Date().toISOString();
  for (const row of rows) {
    if (row.bpmnXml.trim()) continue;
    await db
      .update(table)
      .set({ bpmnXml: DEFAULT_BPMN_XML, workflowJson, updatedAt: now })
      .where(eq(table.id, row.id));
  }
}
