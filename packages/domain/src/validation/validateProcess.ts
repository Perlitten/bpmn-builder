import type { Process } from '../types/Process.js';
import type { ValidationIssue } from '../types/ValidationIssue.js';
import { isNonEmptyString } from './isNonEmptyString.js';
import { isProcessStatus } from './isProcessStatus.js';
import { validateWorkflowDocument } from './validateWorkflow.js';

export type ProcessPatch = Partial<
  Pick<Process, 'name' | 'description' | 'status' | 'bpmnXml' | 'workflowJson'>
>;

export type ProcessValidationResult =
  | { ok: true; process: Process }
  | { ok: false; error: string; issues: ValidationIssue[] };

function fail(error: string, issues?: ValidationIssue[]): ProcessValidationResult {
  return { ok: false, error, issues: issues ?? [{ code: 'invalid_process', message: error }] };
}

export function validateProcessPatch(
  patch: ProcessPatch,
): { ok: true } | { ok: false; error: string; issues: ValidationIssue[] } {
  if (patch.name !== undefined && !isNonEmptyString(patch.name)) return fail('name is required');
  if (patch.status !== undefined && !isProcessStatus(patch.status)) return fail('invalid status');
  if (patch.bpmnXml !== undefined && !isNonEmptyString(patch.bpmnXml)) return fail('bpmnXml is required');
  if (patch.description !== undefined && patch.description !== null && typeof patch.description !== 'string') {
    return fail('description must be a string or null');
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
  if (!isProcessStatus(input.status)) return fail('invalid status');
  if (!isNonEmptyString(input.bpmnXml)) return fail('bpmnXml is required');
  if (input.description != null && typeof input.description !== 'string') {
    return fail('description must be a string or null');
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
