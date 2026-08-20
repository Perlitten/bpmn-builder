import { getNode } from '@bpmn/semantic-core';
import { describe, expect, it } from 'vitest';
import {
  describeBpmnXml,
  describeSemanticProcess,
  descriptionInputIssue,
  detectExclusiveDecision,
  detectParallelDecision,
} from './describeProcess';
import { previewBpmn } from './bpmnPreview';

const KYC =
  'Collect identity documents then run KYC. If the check passed, open the account. Otherwise reject the application.';

describe('detectExclusiveDecision', () => {
  it('does not invent XOR from “or” in prose', () => {
    expect(detectExclusiveDecision('Hire a candidate: offer or reject.')).toBeNull();
  });

  it('reads if/otherwise, one-sided if, passed/failed, and yes/no pairs', () => {
    expect(detectExclusiveDecision(KYC)).toMatchObject({
      name: 'Passed?',
      branches: [
        { name: 'Passed', tasks: ['open the account'] },
        { name: 'Otherwise', tasks: ['reject the application'] },
      ],
    });
    expect(detectExclusiveDecision('If the weather is nice, go outside.')).toMatchObject({
      name: 'Weather is nice?',
      branches: [
        { tasks: ['go outside'] },
        { name: 'Otherwise', tasks: [] },
      ],
    });
    expect(
      detectExclusiveDecision('Run KYC. If passed, open the account. If failed, reject the application.'),
    ).toMatchObject({
      name: 'Passed?',
      branches: [
        { name: 'Passed', tasks: ['open the account'] },
        { name: 'Failed', tasks: ['reject the application'] },
      ],
    });
    expect(detectExclusiveDecision('Screen the applicant. If yes, onboard. If no, decline.')).toMatchObject({
      name: 'Yes?',
      branches: [
        { name: 'Yes', tasks: ['onboard'] },
        { name: 'No', tasks: ['decline'] },
      ],
    });
    expect(
      detectExclusiveDecision('Run KYC. Passed: open the account. Failed: reject the application.'),
    ).toMatchObject({
      name: 'Passed?',
      branches: [
        { name: 'Passed', tasks: ['open the account'] },
        { name: 'Failed', tasks: ['reject the application'] },
      ],
    });
  });

  it('finds a conditional after a semicolon and preserves sequential branch tasks', () => {
    expect(
      detectExclusiveDecision(
        'Review the claim; if fraud is suspected, escalate to SIU then notify the customer, otherwise pay the claim',
      ),
    ).toMatchObject({
      prefix: 'Review the claim; ',
      branches: [
        { tasks: ['escalate to SIU', 'notify the customer'] },
        { tasks: ['pay the claim'] },
      ],
    });
  });

  it('treats otherwise as a delimiter only at a clause boundary', () => {
    expect(detectExclusiveDecision('If yes, do the otherwise weird step. Otherwise stop')).toMatchObject({
      branches: [
        { tasks: ['do the otherwise weird step'] },
        { tasks: ['stop'] },
      ],
    });
  });

  it('rejects nested or repeated otherwise clauses instead of swallowing them into task names', () => {
    expect(() =>
      detectExclusiveDecision('If risk is high, escalate. Otherwise if risk is low, auto-approve. Otherwise review'),
    ).toThrow(/Multiple|Nested/);
    expect(() =>
      detectExclusiveDecision('If it passed, approve. Otherwise reject. Otherwise escalate'),
    ).toThrow('Multiple “otherwise/else”');
  });
});

describe('multilingual conditional descriptions', () => {
  const multilingualCases = [
    {
      lang: 'English',
      input:
        'Customer submits a request. Manager checks the data. If the data is valid then create a contract, otherwise send it back.',
      decisionName: 'Data is valid?',
      branchLabels: ['Data is valid', 'Otherwise'],
      taskCounts: [1, 1],
    },
    {
      lang: 'Russian',
      input:
        'Клиент оставляет заявку. Менеджер проверяет данные. Если данные верны, оформить договор, иначе вернуть на доработку.',
      decisionName: 'Данные верны?',
      branchLabels: ['Данные верны', 'Otherwise'],
      taskCounts: [1, 1],
    },
    {
      lang: 'German',
      input:
        'Kunde reicht Antrag ein. Manager prüft Daten. Wenn die Daten gültig sind, Vertrag erstellen, ansonsten zurückschicken.',
      decisionName: 'Die Daten gültig sind?',
      branchLabels: ['Die Daten gültig sind', 'Otherwise'],
      taskCounts: [1, 1],
    },
    {
      lang: 'French',
      input:
        'Le client soumet une demande. Le responsable vérifie. Si les données sont valides, créer un contrat, sinon renvoyer.',
      decisionName: 'Les données sont valides?',
      branchLabels: ['Les données sont valides', 'Otherwise'],
      taskCounts: [1, 1],
    },
    {
      lang: 'Chinese',
      input: '客户提交申请。经理检查数据。如果数据有效，创建合同，否则退回。',
      decisionName: '数据有效?',
      branchLabels: ['数据有效', 'Otherwise'],
      taskCounts: [1, 1],
    },
  ];

  it.each(multilingualCases)(
    'parses conditional process structure for $lang',
    ({ input, decisionName, branchLabels }) => {
      const process = describeSemanticProcess('Multilingual Process', input);

      // Asserts process structure
      expect(process.regions).toHaveLength(1);
      expect(process.nodes.filter((n) => n.type === 'exclusiveGateway')).toHaveLength(2);

      const region = process.regions[0]!;
      expect(region.type).toBe('exclusive');
      const splitNode = getNode(process, region.split);
      expect(splitNode.name).toBe(decisionName);

      expect(region.branches.map((b) => b.name)).toEqual(branchLabels);
    },
  );

  it('negative case: description with no condition yields regions: 0', () => {
    const process = describeSemanticProcess(
      'Linear Process',
      'Клиент оставляет заявку. Менеджер проверяет данные. Оформить договор.',
    );
    expect(process.regions).toHaveLength(0);
    expect(process.nodes.filter((n) => n.type === 'exclusiveGateway')).toHaveLength(0);
  });

  it('recognizes Russian pairKind keywords (прошла/не прошла, успешно/неуспешно, да/нет)', () => {
    expect(
      detectExclusiveDecision('Запустить проверку KYC. Если прошла, открыть счет. Если не прошла, отклонить заявку.'),
    ).toMatchObject({
      name: 'Passed?',
      branches: [
        { name: 'Passed', tasks: ['открыть счет'] },
        { name: 'Failed', tasks: ['отклонить заявку'] },
      ],
    });

    expect(
      detectExclusiveDecision('Проверить заявку. Если успешно, одобрить. Если неуспешно, отклонить.'),
    ).toMatchObject({
      name: 'Passed?',
      branches: [
        { name: 'Passed', tasks: ['одобрить'] },
        { name: 'Failed', tasks: ['отклонить'] },
      ],
    });

    expect(
      detectExclusiveDecision('Запросить согласие. Если да, продолжить. Если нет, завершить.'),
    ).toMatchObject({
      name: 'Yes?',
      branches: [
        { name: 'Yes', tasks: ['продолжить'] },
        { name: 'No', tasks: ['завершить'] },
      ],
    });
  });

  it('preserves Cyrillic in shortName and questionName without mid-word truncation mangling', () => {
    expect(
      detectExclusiveDecision(
        'Если данные клиента полностью проверены и являются совершенно корректными, оформить договор, иначе вернуть на доработку.',
      ),
    ).toMatchObject({
      name: 'Данные клиента полностью…?',
      branches: [
        { name: 'Данные клиента полностью…', tasks: ['оформить договор'] },
        { name: 'Otherwise', tasks: ['вернуть на доработку'] },
      ],
    });
  });
});

describe('parallel descriptions', () => {
  it('builds explicit parallel branches for meanwhile / at the same time', () => {
    expect(
      detectParallelDecision('Pack the box, meanwhile print the label, at the same time notify the courier'),
    ).toEqual({
      prefix: '',
      branches: [['Pack the box'], ['print the label'], ['notify the courier']],
    });
    const process = describeSemanticProcess(
      'Fulfil order',
      'Pack the box, meanwhile print the label, at the same time notify the courier',
    );
    expect(process.regions).toHaveLength(1);
    expect(process.regions[0]?.type).toBe('parallel');
    expect(process.regions[0]?.branches).toHaveLength(3);
  });
});

describe('describeSemanticProcess', () => {
  it('builds a KYC XOR via splitExclusive with two named branches', () => {
    const process = describeSemanticProcess('KYC onboarding', KYC);
    expect(process.regions).toHaveLength(1);
    const region = process.regions[0]!;
    expect(region.type).toBe('exclusive');
    expect(getNode(process, region.split).type).toBe('exclusiveGateway');
    expect(getNode(process, region.join).type).toBe('exclusiveGateway');
    expect(getNode(process, region.split).name).toBe('Passed?');
    expect(region.branches.map((branch) => branch.name)).toEqual(['Passed', 'Otherwise']);
    expect(region.branches.map((branch) => branch.nodeIds.map((id) => getNode(process, id).name))).toEqual([
      ['open the account'],
      ['reject the application'],
    ]);
    expect(process.nodes.filter((node) => node.type === 'task').map((node) => node.name)).toEqual([
      'Collect identity documents',
      'run KYC',
      'open the account',
      'reject the application',
    ]);
  });

  it('stays linear when there is no exclusive pair and preserves a single sentence', () => {
    const process = describeSemanticProcess('Hire', 'Ship it');
    expect(process.regions).toEqual([]);
    expect(process.nodes.filter((node) => node.type === 'task').map((node) => node.name)).toEqual(['Ship it']);
  });

  it('rejects loops rather than drawing them as dead-end tasks', () => {
    const text = 'Review request, then go back to step 2';
    expect(descriptionInputIssue(text)).toMatch(/Loops are not generated/);
    expect(() => describeSemanticProcess('Loop', text)).toThrow(/Loops are not generated/);
  });
});

describe('describeBpmnXml', () => {
  it('compiles KYC through layout XML, not Camunda invention', () => {
    const xml = describeBpmnXml('KYC onboarding', KYC);
    expect(xml).not.toMatch(/camunda:/i);
    expect(xml).toContain('bpmn:exclusiveGateway');
    expect(xml).toContain('name="Passed?"');
    expect(xml).toContain('name="Passed"');
    expect(xml).toContain('name="Otherwise"');
    const preview = previewBpmn(xml);
    expect(preview.kind).toBe('process');
    expect(preview.happyPath).toContain('Collect identity doc');
    expect(preview.happyPath).toContain('run KYC');
    expect(preview.counts).toContain('XOR');
    expect(preview.branches.join(' ')).toMatch(/reject the application/i);
  });
});
