declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>, options?: unknown);
    fromXML(
      xml: string,
      typeName?: string | object,
      options?: object,
    ): Promise<{
      rootElement: unknown;
      elementsById: Record<string, unknown>;
      references: unknown[];
      warnings: unknown[];
    }>;
    toXML(element: unknown, options?: { format?: boolean; preamble?: boolean }): Promise<{ xml: string }>;
    create(type: string, attrs?: Record<string, unknown>): unknown;
    createAny(name: string, nsUri: string, properties?: Record<string, unknown>): unknown;
  }
}

declare module 'moddle-xml' {
  export class Writer {
    constructor(options?: { format?: boolean; preamble?: boolean });
    toXML(element: unknown): string;
  }
}
