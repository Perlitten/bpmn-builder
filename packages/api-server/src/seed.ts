import { eq } from 'drizzle-orm';
import { bpmnToWorkflow } from '../../bpmn-adapter/src/index.js';
import { getProcessesTable, getQueryDb } from '../../db/src/index.js';
import { DEFAULT_BPMN_XML } from './defaultBpmn.js';
import { countProcesses } from './services/processService.js';

const SEED_PROCESSES = [
  {
    id: 'onboarding',
    name: 'Customer Onboarding',
    description: 'Onboard new customers end-to-end',
  },
  {
    id: 'approval',
    name: 'Purchase Approval',
    description: 'Route purchase requests for approval',
  },
];

export async function seedIfEmpty(): Promise<void> {
  if (await countProcesses() > 0) return;

  const db = getQueryDb();
  const table = getProcessesTable();
  const now = new Date().toISOString();
  const workflowJson = JSON.stringify(await bpmnToWorkflow(DEFAULT_BPMN_XML));

  for (const seed of SEED_PROCESSES) {
    await db.insert(table).values({
      id: seed.id,
      name: seed.name,
      description: seed.description,
      status: 'draft',
      bpmnXml: DEFAULT_BPMN_XML,
      workflowJson,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(`Seeded ${SEED_PROCESSES.length} demo processes`);
}

export async function repairEmptyDiagrams(): Promise<void> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const rows = (await db.select({ id: table.id, bpmnXml: table.bpmnXml }).from(table)) as {
    id: string;
    bpmnXml: string;
  }[];
  const workflowJson = JSON.stringify(await bpmnToWorkflow(DEFAULT_BPMN_XML));
  const now = new Date().toISOString();
  for (const row of rows) {
    if (/startEvent/i.test(row.bpmnXml)) continue;
    await db
      .update(table)
      .set({ bpmnXml: DEFAULT_BPMN_XML, workflowJson, updatedAt: now })
      .where(eq(table.id, row.id));
  }
}
