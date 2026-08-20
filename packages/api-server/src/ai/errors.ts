import { assistantTimeoutError } from './timeout.js';

export function isUpstreamError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('name' in error && error.name === 'UpstreamError') return true;
  const message = error instanceof Error ? error.message : String(error);
  if (/did not respond|fetch failed|econnrefused|enotfound|ehostunreach/i.test(message)) return true;
  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined;
  return cause != null && cause !== error && isUpstreamError(cause);
}

export function friendlyAiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const normalized = raw.toLowerCase();
  if (isUpstreamError(error)) {
    return 'AI provider did not respond. Check the API key and network, then retry.';
  }
  if (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      /timed out after \d+(?:\.\d+)?(?:s|ms)|aborted due to timeout|this operation was aborted/i.test(raw))
  ) {
    return assistantTimeoutError().message;
  }
  if (/NVIDIA_API_KEY|GEMINI_API_KEY/i.test(raw) || /not configured/i.test(raw)) {
    return 'AI agent is not configured. Add the selected provider API key and restart the server.';
  }
  if (
    normalized.includes('nvidia api 401') ||
    normalized.includes('unauthorized') ||
    (normalized.includes('invalid') && normalized.includes('api key'))
  ) {
    return 'NVIDIA rejected the API key. Replace NVIDIA_API_KEY and restart the server.';
  }
  if (/credits (?:are )?depleted|prepayment/i.test(raw)) {
    return 'AI credits are depleted for the selected provider.';
  }
  if (/quota|rate limit|429/i.test(raw)) {
    return 'AI provider rate limit hit. Wait a moment and try again.';
  }
  return raw || 'The AI agent could not complete this request.';
}

export function isConfigError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error || '');
  return /NVIDIA_API_KEY|GEMINI_API_KEY|not configured/i.test(raw);
}
