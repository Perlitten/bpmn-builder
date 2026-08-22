import type { Application, Request, Response } from 'express';
import { createFeedback, FeedbackValidationError, listFeedback } from '../services/feedbackService.js';

function ownerId(req: Request): string {
  const id = req.user?.id;
  if (!id) throw new Error('Sign in required');
  return id;
}

export function registerFeedbackRoutes(app: Application): void {
  app.get('/api/feedback', async (req: Request, res: Response) => {
    try {
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
        res.status(400).json({ error: 'limit must be an integer between 1 and 100' });
        return;
      }
      const user = req.user;
      if (!user) throw new Error('Sign in required');
      res.json({ feedback: await listFeedback({ id: user.id, email: user.email }, rawLimit) });
    } catch {
      res.status(500).json({ error: 'Failed to list feedback' });
    }
  });

  app.post('/api/feedback', async (req: Request, res: Response) => {
    try {
      const feedback = await createFeedback({
        userId: ownerId(req),
        category: req.body?.category,
        message: req.body?.message,
        page: req.body?.page,
        processId: req.body?.processId,
      });
      res.status(201).json({ feedback });
    } catch (error) {
      if (error instanceof FeedbackValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });
}
