import type { AppRoute } from './types';

export function readRoute(): AppRoute {
  const path = window.location.pathname;
  const match = path.match(/^\/processes\/([^/]+)$/);
  if (match?.[1]) return { name: 'editor', processId: match[1] };
  return { name: 'list' };
}

export function writeRoute(route: AppRoute, mode: 'push' | 'replace' = 'push'): void {
  const path = route.name === 'list' ? '/' : `/processes/${route.processId}`;
  const state = {
    route,
    fromList: route.name === 'editor' && window.location.pathname === '/',
  };
  if (mode === 'replace') {
    window.history.replaceState(state, '', path);
    return;
  }
  window.history.pushState(state, '', path);
}
