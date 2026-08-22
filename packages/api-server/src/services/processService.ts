import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import { getDbDriver, getProcessesTable, getQueryDb } from '../../../db/src/index.js';
import {
  BpmnImportError,
  bpmnToWorkflow,
  importBpmnXml,
  workflowToBpmn,
  xmlToProcess,
} from '../../../bpmn-adapter/src/index.js';
import {
  PROCESS_NAME_MAX,
  PROCESS_DESCRIPTION_MAX,
  copyProcessName,
  type ProcessPatch,
  type ProcessSummary,
  type StoredProcess,
  validateProcess,
  validateProcessPatch,
  validateWorkflowDocument,
  type WorkflowDocument,
} from '../../../domain/src/index.js';
import { DEFAULT_EXECUTION_PROFILE, lintProcess } from '../../../rules/src/index.js';
import { DEFAULT_BPMN_XML } from '../defaultBpmn.js';
import { ProcessConflictError, ProcessValidationError } from './errors.js';
import type { ProcessListQuery } from './processListQuery.js';

type ProcessRow = {
  id: string;
  userId?: string | null;
  name: string;
  description: string | null;
  status: string;
  bpmnXml: string;
  workflowJson: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

const BUILTIN_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  workflow: WorkflowDocument;
}> = [
  {
    id: 'starter:approval',
    name: 'Approval decision',
    description: 'Review a request and route it to an approved or rejected outcome.',
    workflow: {
      processId: 'Approval_Process',
      nodes: [
        { id: 'Start', type: 'startEvent', label: 'Start', x: 40, y: 92 },
        { id: 'Review', type: 'userTask', label: 'Review request', x: 160, y: 80 },
        { id: 'Decision', type: 'exclusiveGateway', label: 'Approved?', x: 320, y: 83 },
        { id: 'Approve', type: 'task', label: 'Approve request', x: 440, y: 24 },
        { id: 'Reject', type: 'task', label: 'Reject request', x: 440, y: 144 },
        { id: 'EndApproved', type: 'endEvent', label: 'Approved', x: 600, y: 36 },
        { id: 'EndRejected', type: 'endEvent', label: 'Rejected', x: 600, y: 156 },
      ],
      edges: [
        { id: 'F1', source: 'Start', target: 'Review' },
        { id: 'F2', source: 'Review', target: 'Decision' },
        { id: 'F3', source: 'Decision', target: 'Approve', label: 'Yes' },
        { id: 'F4', source: 'Decision', target: 'Reject', label: 'No' },
        { id: 'F5', source: 'Approve', target: 'EndApproved' },
        { id: 'F6', source: 'Reject', target: 'EndRejected' },
      ],
    },
  },
  {
    id: 'starter:onboarding',
    name: 'Employee onboarding',
    description: 'Collect details, provision access, and welcome a new employee.',
    workflow: {
      processId: 'Onboarding_Process',
      nodes: [
        { id: 'Start', type: 'startEvent', label: 'New hire', x: 40, y: 72 },
        { id: 'Collect', type: 'userTask', label: 'Collect details', x: 160, y: 60 },
        { id: 'Access', type: 'serviceTask', label: 'Provision access', x: 320, y: 60 },
        { id: 'Welcome', type: 'userTask', label: 'Welcome employee', x: 480, y: 60 },
        { id: 'End', type: 'endEvent', label: 'Ready', x: 650, y: 72 },
      ],
      edges: [
        { id: 'F1', source: 'Start', target: 'Collect' },
        { id: 'F2', source: 'Collect', target: 'Access' },
        { id: 'F3', source: 'Access', target: 'Welcome' },
        { id: 'F4', source: 'Welcome', target: 'End' },
      ],
    },
  },
  {
    id: 'starter:incident',
    name: 'Incident response',
    description: 'Triage an incident, resolve it, and confirm service recovery.',
    workflow: {
      processId: 'Incident_Process',
      nodes: [
        { id: 'Start', type: 'startEvent', label: 'Alert', x: 40, y: 72 },
        { id: 'Triage', type: 'userTask', label: 'Triage incident', x: 160, y: 60 },
        { id: 'Resolve', type: 'userTask', label: 'Resolve incident', x: 320, y: 60 },
        { id: 'Verify', type: 'serviceTask', label: 'Verify recovery', x: 480, y: 60 },
        { id: 'End', type: 'endEvent', label: 'Recovered', x: 650, y: 72 },
      ],
      edges: [
        { id: 'F1', source: 'Start', target: 'Triage' },
        { id: 'F2', source: 'Triage', target: 'Resolve' },
        { id: 'F3', source: 'Resolve', target: 'Verify' },
        { id: 'F4', source: 'Verify', target: 'End' },
      ],
    },
  },
];

const BUILTIN_TEMPLATE_BY_ID = new Map(BUILTIN_TEMPLATES.map((template) => [template.id, template]));

/**
 * A normal single-process summary needs only the persisted workflow DTO and
 * the lint pass. Parsing it into the semantic collaboration graph as well is
 * redundant. Keep that heavier pass for the BPMN constructs whose summary
 * actually exposes collaboration metadata.
 */
const SUMMARY_SEMANTIC_MARKER =
  /<(?:[A-Za-z_][\w.-]*:)?(?:collaboration|participant|lane|messageFlow|boundaryEvent)\b/i;

function needsSemanticSummary(bpmnXml: string): boolean {
  return SUMMARY_SEMANTIC_MARKER.test(bpmnXml);
}

function parseStoredWorkflow(raw: string | null): WorkflowDocument | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkflowDocument;
  } catch {
    return null;
  }
}

function toProcess(row: ProcessRow): StoredProcess {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as StoredProcess['status'],
    bpmnXml: row.bpmnXml,
    workflowJson: parseStoredWorkflow(row.workflowJson),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function workflowForSummary(row: ProcessRow): Promise<WorkflowDocument | null> {
  const stored = parseStoredWorkflow(row.workflowJson);
  if (stored) return stored;
  try {
    return await bpmnToWorkflow(row.bpmnXml);
  } catch {
    return null;
  }
}

async function toSummary(row: ProcessRow): Promise<ProcessSummary> {
  const workflow = await workflowForSummary(row);
  const quality = lintProcess(row.bpmnXml, {
    executionProfile: DEFAULT_EXECUTION_PROFILE,
  });
  let collaboration: Awaited<ReturnType<typeof xmlToProcess>> | null = null;
  if (needsSemanticSummary(row.bpmnXml)) {
    try {
      collaboration = await xmlToProcess(row.bpmnXml);
    } catch {
      /* The lint result still carries the useful parse error for malformed XML. */
    }
  }
  const peerNodes = collaboration?.processes?.flatMap((process) => process.nodes) ?? [];
  const semanticNodes = [...(collaboration?.nodes ?? []), ...peerNodes];
  const allNodes = workflow?.nodes ?? [];
  const allEdges = workflow?.edges ?? [];
  const nodes = allNodes.slice(0, 16);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (workflow?.edges ?? [])
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, 24);
  const typeCount = (type: string) => allNodes.filter((node) => node.type === type).length;
  const tasks = allNodes.filter(
    (node) => !node.type.toLowerCase().includes('event') && !node.type.toLowerCase().includes('gateway'),
  ).length;
  const gateways = allNodes.filter((node) => node.type.toLowerCase().includes('gateway'));
  const ends = typeCount('endEvent');
  const outgoing = new Map<string, number>();
  for (const edge of allEdges) outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
  const branches = Math.max(0, ...outgoing.values());
  const starter = allNodes.length === 3 && tasks === 1 && typeCount('startEvent') === 1 && ends === 1;
  const structure = [
    starter ? 'Starter' : null,
    tasks ? `${tasks} ${tasks === 1 ? 'task' : 'tasks'}` : null,
    gateways.filter((node) => node.type === 'exclusiveGateway').length
      ? `${gateways.filter((node) => node.type === 'exclusiveGateway').length} XOR`
      : null,
    gateways.filter((node) => node.type === 'parallelGateway').length
      ? `${gateways.filter((node) => node.type === 'parallelGateway').length} AND`
      : null,
    branches > 1 ? `${branches} branches` : null,
    ends ? `${ends} ${ends === 1 ? 'end' : 'ends'}` : null,
    collaboration?.participants?.length
      ? `${collaboration.participants.length} ${collaboration.participants.length === 1 ? 'pool' : 'pools'}`
      : null,
    collaboration?.lanes?.length
      ? `${collaboration.lanes.length} ${collaboration.lanes.length === 1 ? 'lane' : 'lanes'}`
      : null,
    collaboration?.messageFlows?.length
      ? `${collaboration.messageFlows.length} ${collaboration.messageFlows.length === 1 ? 'message flow' : 'message flows'}`
      : null,
    semanticNodes.filter((node) => node.type === 'boundaryEvent').length
      ? `${semanticNodes.filter((node) => node.type === 'boundaryEvent').length} boundary events`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const ordered = [...nodes].sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));
  const caption = ordered
    .slice(0, 8)
    .map((node) => node.label.trim() || node.type.replace(/([A-Z])/g, ' $1').trim())
    .join(' → ');
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as ProcessSummary['status'],
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.id.startsWith('starter:') ? { builtin: true } : {}),
    structure: structure || 'Empty process',
    quality: {
      errors: quality.errors.length,
      warnings: quality.warnings.length,
      style: quality.style.length,
      ...(quality.suggestions.length ? { suggestions: quality.suggestions.length } : {}),
    },
      preview: {
        caption: caption || 'Empty process',
        ...(collaboration?.participants?.length ? { participants: collaboration.participants.length } : {}),
        ...(collaboration?.lanes?.length ? { lanes: collaboration.lanes.length } : {}),
        ...(collaboration?.messageFlows?.length ? { messageFlows: collaboration.messageFlows.length } : {}),
        ...(semanticNodes.some((node) => node.type === 'boundaryEvent')
          ? { boundaryEvents: semanticNodes.filter((node) => node.type === 'boundaryEvent').length }
          : {}),
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label.slice(0, 80),
        ...(typeof node.x === 'number' ? { x: node.x } : {}),
        ...(typeof node.y === 'number' ? { y: node.y } : {}),
      })),
      edges: edges.map((edge) => ({ source: edge.source, target: edge.target })),
    },
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

function assertPersisted(process: StoredProcess): StoredProcess {
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
  // Wildcards are intentionally treated as literal search text. Backslash is
  // removed as well because SQLite/Postgres differ in their implicit LIKE
  // escape rules when no explicit ESCAPE clause is supplied.
  return `%${q.normalize('NFKC').toLocaleLowerCase().replace(/[\\%_]/g, '')}%`;
}

function listWhere(table: ReturnType<typeof getProcessesTable>, query: ProcessListQuery, userId: string) {
  const parts = [eq(table.userId, userId)];
  if (query.kind === 'template') parts.push(eq(table.status, 'template'));
  if (query.kind === 'process') parts.push(ne(table.status, 'template'));
  if (query.q) {
    const pattern = likePattern(query.q);
    const normalizedName = getDbDriver() === 'sqlite' ? sql`unicode_lower(${table.name})` : sql`lower(${table.name})`;
    const normalizedDescription = getDbDriver() === 'sqlite'
      ? sql`unicode_lower(coalesce(${table.description}, ''))`
      : sql`lower(coalesce(${table.description}, ''))`;
    const normalizedXml = getDbDriver() === 'sqlite'
      ? sql`unicode_lower(${table.bpmnXml})`
      : sql`lower(${table.bpmnXml})`;
    const search = or(
      sql`${normalizedName} like ${pattern}`,
      sql`${normalizedDescription} like ${pattern}`,
      sql`${normalizedXml} like ${pattern}`,
    );
    if (search) parts.push(search);
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return and(...parts);
}

export async function listProcesses(query: ProcessListQuery, userId: string): Promise<ProcessListResult> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const where = listWhere(table, query, userId);
  const offset = (query.page - 1) * query.limit;
  const normalizedName = getDbDriver() === 'sqlite' ? sql`unicode_lower(${table.name})` : sql`lower(${table.name})`;
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
    workflowJson: table.workflowJson,
    version: table.version,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };

  const countQuery = db.select({ total: sql<number>`cast(count(*) as int)` }).from(table);
  const listQuery = db.select(columns).from(table);
  const [countRows, rows] = await Promise.all([
    (async () => (await (where ? countQuery.where(where) : countQuery)) as { total: number }[])(),
    (async () =>
      (await (where
        ? listQuery.where(where).orderBy(...order).limit(query.limit).offset(offset)
        : listQuery.orderBy(...order).limit(query.limit).offset(offset))) as ProcessRow[])(),
  ]);

  return {
    processes: await Promise.all(rows.map(toSummary)),
    total: Number(countRows[0]?.total ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export async function getProcessById(id: string, userId: string): Promise<StoredProcess | null> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const rows = (await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1)) as ProcessRow[];
  const row = rows[0];
  return row ? toProcess(row) : null;
}

function builtinTemplateRows(): ProcessRow[] {
  return BUILTIN_TEMPLATES.map((template) => ({
    id: template.id,
    userId: null,
    name: template.name,
    description: template.description,
    status: 'template',
    bpmnXml: workflowToBpmn(template.workflow),
    workflowJson: JSON.stringify(template.workflow),
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
}

function compareBuiltinTemplates(a: ProcessRow, b: ProcessRow, sort: ProcessListQuery['sort']): number {
  if (sort === 'name_asc') return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  if (sort === 'name_desc') return b.name.localeCompare(a.name) || a.id.localeCompare(b.id);
  const updated = a.updatedAt.localeCompare(b.updatedAt);
  return (sort === 'updated_asc' ? updated : -updated) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export async function listTemplates(query: ProcessListQuery, userId: string): Promise<ProcessListResult> {
  const db = getQueryDb();
  const table = getProcessesTable();
  const where = listWhere(table, { ...query, kind: 'template' }, userId);
  const q = query.q.normalize('NFKC').toLocaleLowerCase();
  const builtins = builtinTemplateRows()
    .filter((row) => !q || `${row.name} ${row.description ?? ''}`.toLocaleLowerCase().includes(q))
    .sort((a, b) => compareBuiltinTemplates(a, b, query.sort));
  const offset = (query.page - 1) * query.limit;
  const selectedBuiltins = builtins.slice(offset, offset + query.limit);
  const userOffset = Math.max(0, offset - builtins.length);
  const userLimit = Math.max(0, query.limit - selectedBuiltins.length);
  const normalizedName = getDbDriver() === 'sqlite' ? sql`unicode_lower(${table.name})` : sql`lower(${table.name})`;
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
    workflowJson: table.workflowJson,
    version: table.version,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
  const countQuery = db.select({ total: sql<number>`cast(count(*) as int)` }).from(table);
  const listQuery = db.select(columns).from(table);
  const [countRows, rows] = await Promise.all([
    (async () => (await (where ? countQuery.where(where) : countQuery)) as { total: number }[])(),
    userLimit > 0
      ? (async () =>
          (await (where
            ? listQuery.where(where).orderBy(...order).limit(userLimit).offset(userOffset)
            : listQuery.orderBy(...order).limit(userLimit).offset(userOffset))) as ProcessRow[])()
      : Promise.resolve([] as ProcessRow[]),
  ]);
  return {
    processes: await Promise.all([...selectedBuiltins, ...rows].map(toSummary)),
    total: builtins.length + Number(countRows[0]?.total ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

export { copyProcessName };

export async function createProcess(input: {
  name: string;
  description?: string | null;
  templateId?: string;
  bpmnXml?: string;
  userId: string;
}): Promise<StoredProcess> {
  const name = input.name.trim();
  if (!name) throw new ProcessValidationError('name is required');
  if (name.length > PROCESS_NAME_MAX) {
    throw new ProcessValidationError(`name must be at most ${PROCESS_NAME_MAX} characters`);
  }
  if (input.description && input.description.length > PROCESS_DESCRIPTION_MAX) {
    throw new ProcessValidationError(`description must be at most ${PROCESS_DESCRIPTION_MAX} characters`);
  }

  let bpmnXml = DEFAULT_BPMN_XML;
  if (input.bpmnXml?.trim()) {
    bpmnXml = input.bpmnXml;
  } else if (input.templateId) {
    const builtin = BUILTIN_TEMPLATE_BY_ID.get(input.templateId);
    if (builtin) {
      bpmnXml = workflowToBpmn(builtin.workflow);
    } else {
      const template = await getProcessById(input.templateId, input.userId);
      if (!template) throw new ProcessValidationError('template not found');
      bpmnXml = template.bpmnXml;
    }
  }

  const db = getQueryDb();
  const table = getProcessesTable();
  const now = new Date().toISOString();
  const workflowJson = await workflowFromXml(bpmnXml);
  const row = {
    id: randomUUID(),
    userId: input.userId,
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

export async function duplicateProcess(id: string, userId: string, name?: string): Promise<StoredProcess | null> {
  const existing = await getProcessById(id, userId);
  if (!existing) return null;
  return createProcess({
    name: name !== undefined ? name : copyProcessName(existing.name),
    description: existing.description ?? undefined,
    bpmnXml: existing.bpmnXml,
    userId,
  });
}

export async function createTemplateFromProcess(id: string, userId: string): Promise<StoredProcess | null> {
  const existing = await getProcessById(id, userId);
  if (!existing) return null;

  const db = getQueryDb();
  const table = getProcessesTable();
  const now = new Date().toISOString();
  const name = existing.name.endsWith(' template') ? existing.name : `${existing.name} template`;
  const row = {
    id: randomUUID(),
    userId,
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

export async function updateProcess(id: string, patch: ProcessPatch, userId: string): Promise<StoredProcess | null> {
  const existing = await getProcessById(id, userId);
  if (!existing) return null;
  assertPatch(patch);
  if (patch.version === undefined) throw new ProcessValidationError('version is required');
  if (patch.version !== existing.version) throw new ProcessConflictError(existing.version);

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
  const changed = await db
    .update(table)
    .set({
      name: next.name,
      description: next.description,
      status: next.status,
      bpmnXml: next.bpmnXml,
      workflowJson: next.workflowJson ? JSON.stringify(next.workflowJson) : null,
      version: next.version,
      updatedAt: next.updatedAt,
    })
    .where(and(eq(table.id, id), eq(table.userId, userId), eq(table.version, existing.version)))
    .returning({ id: table.id });

  // The version predicate is the compare-and-swap boundary. A zero-row update
  // means another writer won, even when that writer happened to produce the
  // same numeric next version.
  if (changed.length === 0) {
    const current = await getProcessById(id, userId);
    throw new ProcessConflictError(current?.version ?? existing.version);
  }
  const stored = await getProcessById(id, userId);
  if (!stored || stored.version !== next.version) {
    throw new ProcessConflictError(stored?.version ?? existing.version);
  }
  return stored;
}

export async function deleteProcess(id: string, userId: string): Promise<boolean> {
  const existing = await getProcessById(id, userId);
  if (!existing) return false;
  const db = getQueryDb();
  const table = getProcessesTable();
  await db.delete(table).where(and(eq(table.id, id), eq(table.userId, userId)));
  return true;
}
