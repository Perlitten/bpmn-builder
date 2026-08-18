import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ProcessSummary } from '@bpmn/domain';
import { AuthProvider } from '../auth/AuthGate';
import { ListKindTabs } from './ListKindTabs';
import { ListPaginationFooter } from './ListPaginationFooter';
import { ProcessListPage } from '../../pages/ProcessListPage';
import { draftNameFromTemplate, TemplatesSection } from './TemplatesSection';
import {
  listRange,
  lastListPage,
  listStateFromSearch,
  listTabFromSearch,
  nextListTab,
  searchWithListState,
  searchWithListTab,
} from './listTabs';

const STARTER = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="StartEvent_1" name="Start" />
    <bpmn:task id="Activity_1" name="Task" />
    <bpmn:endEvent id="EndEvent_1" name="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>`;

function summary(name: string): ProcessSummary {
  return {
    id: name,
    name,
    description: null,
    status: 'template',
    bpmnXml: STARTER,
    version: 1,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  };
}

describe('list tabs', () => {
  it('defaults to processes and deep-links ?kind=template', () => {
    expect(listTabFromSearch('')).toBe('process');
    expect(listTabFromSearch('?q=order')).toBe('process');
    expect(listTabFromSearch('?kind=template')).toBe('template');
    expect(listTabFromSearch('kind=template&q=a')).toBe('template');
    expect(searchWithListTab('', 'template')).toBe('?kind=template');
    expect(searchWithListTab('?kind=template', 'process')).toBe('');
    expect(searchWithListTab('?q=a', 'template')).toBe('?q=a&kind=template');
  });

  it('moves between the two tabs with arrows, Home, and End', () => {
    expect(nextListTab('process', 'ArrowRight')).toBe('template');
    expect(nextListTab('template', 'ArrowLeft')).toBe('process');
    expect(nextListTab('process', 'End')).toBe('template');
    expect(nextListTab('template', 'Home')).toBe('process');
    expect(nextListTab('process', 'Enter')).toBeNull();
  });

  it('round-trips search, sort, page, and section through the URL', () => {
    expect(listStateFromSearch('?kind=template&q=invoice&sort=name_desc&page=3')).toEqual({
      kind: 'template',
      q: 'invoice',
      sort: 'name_desc',
      page: 3,
    });
    expect(searchWithListState('', {
      kind: 'template',
      q: 'invoice',
      sort: 'name_desc',
      page: 3,
    })).toBe('?kind=template&q=invoice&sort=name_desc&page=3');
    expect(searchWithListState('?kind=template&q=x&sort=name_asc&page=2', {
      kind: 'process',
      q: '',
      sort: 'updated_desc',
      page: 1,
    })).toBe('');
  });

  it('renders Processes | Templates as tabs without an All filter', () => {
    const html = renderToStaticMarkup(
      createElement(ListKindTabs, { kind: 'process', onChange: () => undefined }),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Processes</);
    expect(html).toMatch(/aria-selected="false"[^>]*>Templates</);
    expect(html).not.toContain('>All<');
    expect(html.match(/role="tab"/g)?.length).toBe(2);
  });
});

describe('list pagination footer', () => {
  it('pins Showing / Prev / Next outside the scrolling list', () => {
    expect(listRange(7, 1, 20)).toEqual({ from: 1, to: 7 });
    expect(listRange(0, 1, 20)).toEqual({ from: 0, to: 0 });
    expect(lastListPage(12, 20)).toBe(1);
    expect(listRange(12, 3, 20)).toEqual({ from: 1, to: 12 });
    const html = renderToStaticMarkup(
      createElement(ListPaginationFooter, {
        from: 1,
        to: 7,
        total: 7,
        page: 1,
        pageSize: 20,
        onPrev: () => undefined,
        onNext: () => undefined,
      }),
    );
    expect(html).toMatch(/^<footer\b/);
    expect(html).toContain('shrink-0');
    expect(html).toContain('Showing 1–7 of 7');
    expect(html).toContain('Prev');
    expect(html).toContain('Next');
  });
});

describe('templates tab content', () => {
  it('keeps compact rows without a stacked TEMPLATES heading or diagram preview', () => {
    expect(draftNameFromTemplate('Invoice template')).toBe('Invoice');
    const html = renderToStaticMarkup(
      createElement(TemplatesSection, {
        templates: [summary('Invoice template')],
        busy: false,
        onUse: () => undefined,
        onOpen: () => undefined,
      }),
    );
    expect(html).toContain('Invoice template');
    expect(html).toContain('Edit');
    expect(html).toContain('Use template');
    expect(html).not.toContain('role="img"');
    expect(html).not.toMatch(/<h2\b/);
    expect(html).not.toContain('TEMPLATES');
  });
});

function listPage(): ReactElement {
  return createElement(AuthProvider, {
    user: { id: 'user-1', email: 'ada@example.com', name: 'Ada', avatarUrl: null },
    children: createElement(ProcessListPage, { onOpenProcess: () => undefined }),
  });
}

describe('ProcessListPage', () => {
  it('uses two tabs and a pinned pagination footer instead of kind pills', () => {
    const html = renderToStaticMarkup(
      createElement(listPage),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('>Processes<');
    expect(html).toContain('>Templates<');
    expect(html).not.toContain('>All<');
    expect(html).not.toMatch(/<h2[^>]*>Templates</);
    expect(html).toMatch(/overflow-y-auto[\s\S]*<footer\b/);
    expect(html).toContain('Showing 0–0 of 0');
    expect(html).toContain('Prev');
    expect(html).toContain('Next');
    expect(html).toContain('flex h-full min-h-0 flex-col');
  });

  it('keeps search, actions, and describe-to-create in one sticky header', () => {
    const html = renderToStaticMarkup(
      createElement(listPage),
    );
    const header = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
    expect(header).toContain('sticky');
    expect(header).not.toMatch(/\bh-11\b/);
    expect(header).toContain('Search processes');
    expect(header).toContain('Open Architect');
    expect(header).toContain('Describe the process');
    expect(header).toContain('Create process');
    expect(header).toContain('maxLength="20000"');
    expect(header).toContain('0/20,000');
    expect(header).toContain('New blank');
    expect(header).not.toContain('+ New');
  });

  it('uses one explicit sort control with visible directions instead of tab-like toggles', () => {
    const html = renderToStaticMarkup(
      createElement(listPage),
    );
    expect(html).toContain('Sort by');
    expect(html).toContain('aria-label="Sort processes"');
    expect(html).toContain('Recently updated');
    expect(html).toContain('Least recently updated');
    expect(html).toContain('Name A–Z');
    expect(html).toContain('Name Z–A');
    expect(html).not.toContain('aria-pressed');
  });

  it('does not show the duplicate dialog until the user confirms from the row menu', () => {
    const html = renderToStaticMarkup(
      createElement(listPage),
    );
    expect(html).not.toContain('Duplicate process');
    expect(html).not.toContain('Make a copy');
  });
});
