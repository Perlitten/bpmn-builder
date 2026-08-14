const GREETINGS = new Set([
  'bonjour',
  'доброе утро',
  'добрый вечер',
  'добрый день',
  'good afternoon',
  'good day',
  'good evening',
  'good morning',
  'hello',
  'hello there',
  'hey',
  'hey there',
  'hi',
  'hi there',
  'hola',
  'how are you',
  'howdy',
  'hiya',
  'ok',
  'okay',
  'ping',
  'привет',
  'приветствую',
  'пока',
  'спасибо',
  'sup',
  'thanks',
  'thank you',
  'thx',
  "what's up",
  'whats up',
  'yo',
  'здрасте',
  'здравствуй',
  'здравствуйте',
  'как дела',
]);

export function normalizeGreeting(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True for a hello / thanks / ping — not a modeling request. */
export function isGreetingMessage(text: string): boolean {
  const normalized = normalizeGreeting(text);
  return Boolean(normalized) && GREETINGS.has(normalized);
}

export function greetingReply(text: string): string {
  if (/[а-яё]/i.test(text)) {
    return 'Привет. Я меняю структуру процесса — напишите, что добавить, разделить или переименовать.';
  }
  return 'Hello. I edit process structure — say what to add, split, or rename.';
}
