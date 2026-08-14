import { next } from '@vercel/functions';
import { isAuthorizedBasic } from './packages/api-server/src/passwordGate.js';

export default function middleware(request: Request): Response {
  const expectedUser = process.env.APP_USER?.trim() || 'preview';
  const expectedPassword = process.env.APP_PASSWORD || '';

  if (!expectedPassword) {
    return new Response('APP_PASSWORD is not configured', {
      status: 503,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  if (isAuthorizedBasic(request.headers.get('authorization') ?? undefined, expectedUser, expectedPassword)) {
    return next({ headers: { 'Cache-Control': 'private, no-store' } });
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="BPMN Builder", charset="UTF-8"',
      'Cache-Control': 'private, no-store',
    },
  });
}

export const config = {
  matcher: '/(.*)',
  runtime: 'nodejs',
};
