export type XmlTag = {
  start: number;
  end: number;
  localName: string;
  rawAttributes: string;
  closing: boolean;
  selfClosing: boolean;
};

export type XmlElement = XmlTag & {
  inner: string;
};

function isWhitespace(value: string): boolean {
  return value === ' ' || value === '\t' || value === '\n' || value === '\r' || value === '\f';
}

function isNameCharacter(value: string): boolean {
  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    value === ':' ||
    value === '_' ||
    value === '-' ||
    value === '.'
  );
}

export function localXmlName(value: string): string {
  const colon = value.lastIndexOf(':');
  return (colon >= 0 ? value.slice(colon + 1) : value).toLowerCase();
}

/** Iterate XML tags without interpolating untrusted names into regular expressions. */
export function* scanXmlTags(xml: string, from = 0): Generator<XmlTag> {
  let cursor = Math.max(0, from);
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor);
    if (start < 0) return;

    let end = start + 1;
    let quote = '';
    while (end < xml.length) {
      const character = xml[end]!;
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      end += 1;
    }
    if (end >= xml.length) return;

    let nameStart = start + 1;
    let closing = false;
    if (xml[nameStart] === '/') {
      closing = true;
      nameStart += 1;
    }
    if (xml[nameStart] === '!' || xml[nameStart] === '?' || !isNameCharacter(xml[nameStart] ?? '')) {
      cursor = end + 1;
      continue;
    }

    let nameEnd = nameStart + 1;
    while (nameEnd < end && isNameCharacter(xml[nameEnd]!)) nameEnd += 1;
    let attributesEnd = end;
    while (attributesEnd > nameEnd && isWhitespace(xml[attributesEnd - 1]!)) attributesEnd -= 1;
    const selfClosing = !closing && attributesEnd > nameEnd && xml[attributesEnd - 1] === '/';
    if (selfClosing) attributesEnd -= 1;

    yield {
      start,
      end: end + 1,
      localName: localXmlName(xml.slice(nameStart, nameEnd)),
      rawAttributes: xml.slice(nameEnd, attributesEnd),
      closing,
      selfClosing,
    };
    cursor = end + 1;
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

export function parseXmlAttributes(raw: string): Map<string, string> {
  const attributes = new Map<string, string>();
  let cursor = 0;
  while (cursor < raw.length) {
    while (cursor < raw.length && (isWhitespace(raw[cursor]!) || raw[cursor] === '/')) cursor += 1;
    const nameStart = cursor;
    while (cursor < raw.length && isNameCharacter(raw[cursor]!)) cursor += 1;
    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }

    const name = localXmlName(raw.slice(nameStart, cursor));
    while (cursor < raw.length && isWhitespace(raw[cursor]!)) cursor += 1;
    if (raw[cursor] !== '=') continue;
    cursor += 1;
    while (cursor < raw.length && isWhitespace(raw[cursor]!)) cursor += 1;
    const quote = raw[cursor];
    if (quote !== '"' && quote !== "'") {
      while (cursor < raw.length && !isWhitespace(raw[cursor]!)) cursor += 1;
      continue;
    }
    cursor += 1;
    const valueStart = cursor;
    while (cursor < raw.length && raw[cursor] !== quote) cursor += 1;
    attributes.set(name, decodeXmlEntities(raw.slice(valueStart, cursor)));
    if (cursor < raw.length) cursor += 1;
  }
  return attributes;
}

export function xmlAttr(attributes: ReadonlyMap<string, string>, name: string): string | undefined {
  return attributes.get(localXmlName(name));
}

export function collectXmlElements(xml: string, localName: string): XmlElement[] {
  const wanted = localXmlName(localName);
  const elements: XmlElement[] = [];
  for (const opening of scanXmlTags(xml)) {
    if (opening.closing || opening.localName !== wanted) continue;
    if (opening.selfClosing) {
      elements.push({ ...opening, inner: '' });
      continue;
    }

    let depth = 1;
    for (const candidate of scanXmlTags(xml, opening.end)) {
      if (candidate.localName !== wanted) continue;
      if (candidate.closing) {
        depth -= 1;
        if (depth === 0) {
          elements.push({
            ...opening,
            end: candidate.end,
            inner: xml.slice(opening.end, candidate.start),
          });
          break;
        }
      } else if (!candidate.selfClosing) {
        depth += 1;
      }
    }
  }
  return elements;
}

export function stripXmlComments(xml: string): string {
  let cursor = 0;
  let result = '';
  while (cursor < xml.length) {
    const start = xml.indexOf('<!--', cursor);
    if (start < 0) return result + xml.slice(cursor);
    result += xml.slice(cursor, start);
    const end = xml.indexOf('-->', start + 4);
    if (end < 0) return result;
    cursor = end + 3;
  }
  return result;
}

export function stripXmlElements(xml: string, localName: string): string {
  const elements = collectXmlElements(xml, localName);
  if (!elements.length) return xml;
  let result = '';
  let cursor = 0;
  for (const element of elements) {
    if (element.start < cursor) continue;
    result += xml.slice(cursor, element.start);
    cursor = element.end;
  }
  return result + xml.slice(cursor);
}
