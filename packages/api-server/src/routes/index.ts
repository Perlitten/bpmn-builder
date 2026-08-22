import type { Application } from 'express';
import { registerAssistantRoutes } from './assistant.js';
import { registerAuthRoutes } from './auth.js';
import { registerHealthRoutes } from './health.js';
import { registerProcessRoutes } from './processes.js';
import { registerFeedbackRoutes } from './feedback.js';

export function registerRoutes(app: Application): void {
  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerProcessRoutes(app);
  registerFeedbackRoutes(app);
  registerAssistantRoutes(app);
}
