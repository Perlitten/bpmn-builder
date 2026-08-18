import type { Application, Request, Response } from 'express';
import { isProcessStatus, type ProcessPatch } from '../../../domain/src/index.js';
import { sendProcessError } from '../services/errors.js';
import { parseProcessListQuery } from '../services/processListQuery.js';
import {
  createProcess,
  createTemplateFromProcess,
  deleteProcess,
  duplicateProcess,
  getProcessById,
  listProcesses,
  listTemplates,
  updateProcess,
} from '../services/processService.js';

function ownerId(req: Request): string {
  const id = req.user?.id;
  if (!id) throw new Error('Sign in required');
  return id;
}

export function registerProcessRoutes(app: Application): void {
  app.get('/api/processes', async (req: Request, res: Response) => {
    try {
      const parsed = parseProcessListQuery(req.query as Record<string, unknown>);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      res.json(await listProcesses(parsed.value, ownerId(req)));
    } catch (error) {
      sendProcessError(res, error, 'Failed to list processes');
    }
  });

  app.get('/api/templates', async (req: Request, res: Response) => {
    try {
      res.json({ templates: await listTemplates(ownerId(req)) });
    } catch (error) {
      sendProcessError(res, error, 'Failed to list templates');
    }
  });

  app.post('/api/processes', async (req: Request, res: Response) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const description =
        typeof req.body?.description === 'string' ? req.body.description : undefined;
      const templateId =
        typeof req.body?.templateId === 'string' ? req.body.templateId : undefined;
      const bpmnXml = typeof req.body?.bpmnXml === 'string' ? req.body.bpmnXml : undefined;
      res.status(201).json({
        process: await createProcess({ name, description, templateId, bpmnXml, userId: ownerId(req) }),
      });
    } catch (error) {
      sendProcessError(res, error, 'Failed to create process');
    }
  });

  app.get('/api/processes/:id', async (req: Request, res: Response) => {
    try {
      const process = await getProcessById(req.params.id, ownerId(req));
      if (!process) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ process });
    } catch (error) {
      sendProcessError(res, error, 'Failed to load process');
    }
  });

  app.patch('/api/processes/:id', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const patch: ProcessPatch = {};
      if (typeof body.name === 'string') patch.name = body.name;
      if (typeof body.description === 'string' || body.description === null) {
        patch.description = body.description;
      }
      if (typeof body.status === 'string') {
        if (!isProcessStatus(body.status)) {
          res.status(400).json({
            error: 'invalid status',
            issues: [{ code: 'invalid_status', message: 'invalid status' }],
          });
          return;
        }
        patch.status = body.status;
      }
      if (typeof body.bpmnXml === 'string') patch.bpmnXml = body.bpmnXml;
      if (body.workflowJson !== undefined) {
        patch.workflowJson = body.workflowJson as ProcessPatch['workflowJson'];
      }
      if (typeof body.version === 'number' && Number.isInteger(body.version)) {
        patch.version = body.version;
      } else if (body.version !== undefined) {
        res.status(400).json({ error: 'version must be a positive integer' });
        return;
      }

      const process = await updateProcess(req.params.id, patch, ownerId(req));
      if (!process) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ process });
    } catch (error) {
      sendProcessError(res, error, 'Failed to update process');
    }
  });

  app.post('/api/processes/:id/duplicate', async (req: Request, res: Response) => {
    try {
      const rawName = req.body?.name;
      let name: string | undefined;
      if (rawName !== undefined) {
        if (typeof rawName !== 'string' || !rawName.trim()) {
          res.status(400).json({ error: 'name is required' });
          return;
        }
        name = rawName.trim();
      }
      const process = await duplicateProcess(req.params.id, ownerId(req), name);
      if (!process) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.status(201).json({ process });
    } catch (error) {
      sendProcessError(res, error, 'Failed to duplicate process');
    }
  });

  app.post('/api/processes/:id/template', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.bpmnXml === 'string') {
        const current = await getProcessById(req.params.id, ownerId(req));
        if (!current) {
          res.status(404).json({ error: 'not found' });
          return;
        }
        const updated = await updateProcess(
          req.params.id,
          { bpmnXml: body.bpmnXml, version: current.version },
          ownerId(req),
        );
        if (!updated) {
          res.status(404).json({ error: 'not found' });
          return;
        }
      }
      const template = await createTemplateFromProcess(req.params.id, ownerId(req));
      if (!template) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.status(201).json({ process: template });
    } catch (error) {
      sendProcessError(res, error, 'Failed to save template');
    }
  });

  app.delete('/api/processes/:id', async (req: Request, res: Response) => {
    try {
      const deleted = await deleteProcess(req.params.id, ownerId(req));
      if (!deleted) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (error) {
      sendProcessError(res, error, 'Failed to delete process');
    }
  });
}
