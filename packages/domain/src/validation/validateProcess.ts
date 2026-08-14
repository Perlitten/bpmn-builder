import type { Process } from '../types/Process.js';
import type { ValidationIssue } from '../types/ValidationIssue.js';
import { isNonEmptyString } from './isNonEmptyString.js';
import { isProcessStatus } from './isProcessStatus.js';
import { validateWorkflowDocument } from './validateWorkflow.js';

export const PROCESS_NAME_MAX = 200;
export const PROCESS_DESCRIPTION_MAX = 20_000;
export const PROCESS_BPMN_XML_MAX = 2 * 1024 * 1024;

export type ProcessPatch = Partial<
  Pick<Process, 'name' | 'description' | 'status' | 'bpmnXml' | 'workflowJson' | 'version'>
>;

export type ProcessValidationResult =
  | { ok: true; process: Process }
  | { ok: false; error: string; issues: ValidationIssue[] };

function fail(error: string, issues?: ValidationIssue[]): ProcessValidationResult {
  return { ok: false, error, issues: issues ?? [{ code: 'invalid_process', message: error }] };
}

function tooLong(label: string, value: string, max: number): ProcessValidationResult | null {
  if (value.length > max) return fail(`${label} must be at most ${max} characters`);
  return null;
}

export function validateProcessPatch(
  patch: ProcessPatch,
): { ok: true } | { ok: false; error: string; issues: ValidationIssue[] } {
  if (patch.name !== undefined) {
    if (!isNonEmptyString(patch.name)) return fail('name is required');
    const length = tooLong('name', patch.name.trim(), PROCESS_NAME_MAX);
    if (length) return length;
  }
  if (patch.status !== undefined && !isProcessStatus(patch.status)) return fail('invalid status');
  if (patch.bpmnXml !== undefined) {
    if (!isNonEmptyString(patch.bpmnXml)) return fail('bpmnXml is required');
    const length = tooLong('bpmnXml', patch.bpmnXml, PROCESS_BPMN_XML_MAX);
    if (length) return length;
  }
  if (patch.description !== undefined && patch.description !== null) {
    if (typeof patch.description !== 'string') return fail('description must be a string or null');
    const length = tooLong('description', patch.description, PROCESS_DESCRIPTION_MAX);
    if (length) return length;
  }
  if (patch.version !== undefined && (!Number.isInteger(patch.version) || patch.version < 1)) {
    return fail('version must be a positive integer');
  }
  if (patch.workflowJson !== undefined && patch.workflowJson !== null) {
    const workflow = validateWorkflowDocument(patch.workflowJson);
    if (!workflow.ok) return fail(workflow.error, workflow.issues);
  }
  return { ok: true };
}

export function validateProcess(
  input: Partial<Process>,
  options: { mode?: 'draft' | 'publish' } = {},
): ProcessValidationResult {
  if (!isNonEmptyString(input.id)) return fail('id is required');
  if (!isNonEmptyString(input.name)) return fail('name is required');
  const nameLen = tooLong('name', input.name.trim(), PROCESS_NAME_MAX);
  if (nameLen) return nameLen;
  if (!isProcessStatus(input.status)) return fail('invalid status');
  if (!isNonEmptyString(input.bpmnXml)) return fail('bpmnXml is required');
  const xmlLen = tooLong('bpmnXml', input.bpmnXml, PROCESS_BPMN_XML_MAX);
  if (xmlLen) return xmlLen;
  if (input.description != null) {
    if (typeof input.description !== 'string') return fail('description must be a string or null');
    const descLen = tooLong('description', input.description, PROCESS_DESCRIPTION_MAX);
    if (descLen) return descLen;
  }
  if (input.version !== undefined && (typeof input.version !== 'number' || !Number.isFinite(input.version))) {
    return fail('version must be a number');
  }

  let workflowJson = input.workflowJson ?? null;
  if (workflowJson != null) {
    const mode = options.mode ?? (input.status === 'published' ? 'publish' : 'draft');
    const workflow = validateWorkflowDocument(workflowJson, { mode });
    if (!workflow.ok) return fail(workflow.error, workflow.issues);
    workflowJson = workflow.workflow;
  } else if ((options.mode ?? input.status) === 'publish') {
    return fail('published process needs a start event', [
      { code: 'missing_start_event', message: 'Published process needs a start event.' },
    ]);
  }

  return {
    ok: true,
    process: {
      id: input.id.trim(),
      name: input.name.trim(),
      description: input.description ?? null,
      status: input.status,
      bpmnXml: input.bpmnXml,
      workflowJson,
      version: typeof input.version === 'number' ? input.version : 1,
      createdAt: typeof input.createdAt === 'string' ? input.createdAt : '',
      updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    },
  };
}
