import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import { getProcessesTable, getQueryDb } from '../../../db/src/index.js';
import { BpmnImportError, bpmnToWorkflow, importBpmnXml, workflowToBpmn } from '../../../bpmn-adapter/src/index.js';
import type { Process, ProcessPatch, ProcessSummary, WorkflowDocument } from '../../../domain/src/index.js';
import { validateProcess, validateProcessPatch, validateWorkflowDocument } from '../../../domain/src/index.js';
import { DEFAULT_BPMN_XML } from '../defaultBpmn.js';
import { ProcessValidationError } from './errors.js';
import type { ProcessListQuery } from './processListQuery.js';

type ProcessRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  bpmnXml: string;
  workflowJson: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

function parseStoredWorkflow(raw: string | null): WorkflowDocument | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkflowDocument;
  } catch {
    return null;
  }
}

function toProcess(row: ProcessRow): Process {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as Process['status'],
    bpmnXml: row.bpmnXml,
    workflowJson: parseStoredWorkflow(row.workflowJson),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSummary(row: ProcessRow): ProcessSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ProcessSummary['status'],
    bpmnXml: row.bpmnXml,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function workflowFromXml(bpmnXml: string): Promise<WorkflowDocument> {
  try {
    await importBpmnXml(bpmnXml);
    return await bpmnToWorkflow(bpmnXml);
  } catch (error) {
    if (error instanceof BpmnImportError) {
      throw new ProcessValidationError(error.message, [{ code: error.code, message: error.message }]);
    }
    const message = error instanceof Error ? error.message : 'invalid BPMN XML';
    throw new ProcessValidationError(message, [{ code: 'invalid_bpmn', message }]);
  }
}

function assertPatch(patch: ProcessPatch): void {
  const result = validateProcessPatch(patch);
  if (!result.ok) throw new ProcessValidationError(result.error, result.issues);
}

function assertPersisted(process: Process): Process {
  const mode = process.status === 'published' ? 'publish' : 'draft';
  const result = validateProcess(process, { mode });
  if (!result.ok) throw new ProcessValidationError(result.error, result.issues);
  return result.process;
}

export type ProcessListResult = {
  processes: ProcessSummary[];
  total: number;
  page: number;
  limit: number;
};

function likePattern(q: string): string {
  return `%${q.toLowerCase().replace(/[%_]/g, '')}%`;
}

function listWhere(table: ReturnType<typeof getProcessesTable>, query: ProcessListQuery) {
  const parts = [];
  if (query.kind === 'template') parts.push(eq(table.status, 'template'));
  if (query.kind === 'process') parts.push(ne(table.status, 'template'));
  if (query.q) {
    const pattern = likePattern(query.q);
    parts.push(
      or(
        sql`lower(${table.name}) like ${pattern}`,
        sql`lower(coalesce(${table.description}, '')) like ${pattern}`,
      ),
    );
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

export async function countProcesses(): Promise<number> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const rows = (await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(table)) as { total: number }[];
  return Number(rows[0]?.total ?? 0);
}

export async function listProcesses(query: ProcessListQuery): Promise<ProcessListResult> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const where = listWhere(table, query);
  const offset = (query.page - 1) * query.limit;
  const normalizedName = sql`lower(${table.name})`;
  const order = (() => {
    if (query.sort === 'updated_asc') return [asc(table.updatedAt), asc(normalizedName), asc(table.id)];
    if (query.sort === 'name_asc') return [asc(normalizedName), desc(table.updatedAt), asc(table.id)];
    if (query.sort === 'name_desc') return [desc(normalizedName), desc(table.updatedAt), asc(table.id)];
    return [desc(table.updatedAt), asc(normalizedName), asc(table.id)];
  })();
  const columns = {
    id: table.id,
    name: table.name,
    description: table.description,
    status: table.status,
    bpmnXml: table.bpmnXml,
    version: table.version,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };

  const countQuery = db.select({ total: sql<number>`cast(count(*) as int)` }).from(table);
  const listQuery = db.select(columns).from(table);
  const countRows = (where ? await countQuery.where(where) : await countQuery) as {
    total: number;
  }[];
  const rows = (
    where
      ? await listQuery.where(where).orderBy(...order).limit(query.limit).offset(offset)
      : await listQuery.orderBy(...order).limit(query.limit).offset(offset)
  ) as ProcessRow[];

  return {
    processes: rows.map(toSummary),
    total: Number(countRows[0]?.total ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export async function getProcessById(id: string): Promise<Process | null> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const rows = (await db.select().from(table).where(eq(table.id, id)).limit(1)) as ProcessRow[];
  const row = rows[0];
  return row ? toProcess(row) : null;
}

export async function listTemplates(): Promise<ProcessSummary[]> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const rows = (await db
    .select()
    .from(table)
    .where(eq(table.status, 'template'))
    .orderBy(desc(table.updatedAt))) as ProcessRow[];
  return rows.map(toSummary);
}

export async function createProcess(input: {
  name: string;
  description?: string | null;
  templateId?: string;
  bpmnXml?: string;
}): Promise<Process> {
  const name = input.name.trim();
  if (!name) throw new ProcessValidationError('name is required');

  let bpmnXml = DEFAULT_BPMN_XML;
  if (input.bpmnXml?.trim()) {
    bpmnXml = input.bpmnXml;
  } else if (input.templateId) {
    const template = await getProcessById(input.templateId);
    if (!template) throw new ProcessValidationError('template not found');
    bpmnXml = template.bpmnXml;
  }

  const db = getQueryDb();
  const table = getProcessesTable();
  const now = new Date().toISOString();
  const workflowJson = await workflowFromXml(bpmnXml);
  const row = {
    id: randomUUID(),
    name,
    description: input.description?.trim() || null,
    status: 'draft',
    bpmnXml,
    workflowJson: JSON.stringify(workflowJson),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(table).values(row);
  return toProcess(row);
}

export async function createTemplateFromProcess(id: string): Promise<Process | null> {
  const existing = await getProcessById(id);
  if (!existing) return null;

  const db = getQueryDb();
  const table = getProcessesTable();
  const now = new Date().toISOString();
  const name = existing.name.endsWith(' template') ? existing.name : `${existing.name} template`;
  const row = {
    id: randomUUID(),
    name,
    description: existing.description,
    status: 'template' as const,
    bpmnXml: existing.bpmnXml,
    workflowJson: existing.workflowJson ? JSON.stringify(existing.workflowJson) : null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(table).values(row);
  return toProcess(row);
}

export async function updateProcess(id: string, patch: ProcessPatch): Promise<Process | null> {
  const existing = await getProcessById(id);
  if (!existing) return null;
  assertPatch(patch);

  let bpmnXml = patch.bpmnXml ?? existing.bpmnXml;
  let workflowJson = existing.workflowJson;

  if (patch.bpmnXml !== undefined) {
    workflowJson = await workflowFromXml(patch.bpmnXml);
  } else if (patch.workflowJson !== undefined) {
    if (patch.workflowJson === null) {
      workflowJson = await workflowFromXml(bpmnXml);
    } else {
      const checked = validateWorkflowDocument(patch.workflowJson);
      if (!checked.ok) throw new ProcessValidationError(checked.error, checked.issues);
      workflowJson = checked.workflow;
      bpmnXml = workflowToBpmn(workflowJson);
    }
  } else if (!workflowJson) {
    workflowJson = await workflowFromXml(bpmnXml);
  }

  const next = assertPersisted({
    ...existing,
    name: patch.name?.trim() ?? existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    status: patch.status ?? existing.status,
    bpmnXml,
    workflowJson,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  });

  const db = getQueryDb();
  const table = getProcessesTable();
  await db.update(table).set({
    name: next.name,
    description: next.description,
    status: next.status,
    bpmnXml: next.bpmnXml,
    workflowJson: next.workflowJson ? JSON.stringify(next.workflowJson) : null,
    version: next.version,
    updatedAt: next.updatedAt,
  }).where(eq(table.id, id));
  return getProcessById(id);
}

export async function deleteProcess(id: string): Promise<boolean> {
  const existing = await getProcessById(id);
  if (!existing) return false;
  const db = getQueryDb();
  const table = getProcessesTable();
  await db.delete(table).where(eq(table.id, id));
  return true;
}
