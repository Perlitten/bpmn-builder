export const PRODUCT_TITLE = 'BPMN 2.0 Builder';

export function pageTitle(route: 'list' | 'editor', processName?: string | null): string {
  if (route === 'list') return PRODUCT_TITLE;
  const name = processName?.trim();
  return name ? `${name} — BPMN` : 'BPMN';
}
