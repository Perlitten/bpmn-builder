import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('health route', () => {
  it('exports createApp', () => {
    const app = createApp();
    expect(app).toBeTruthy();
  });
});
