export function friendlyAiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError' || /timed out after 30s|aborted due to timeout|this operation was aborted/i.test(raw))
  ) {
    return 'Architect timed out after 30s.';
  }
  if (/NVIDIA_API_KEY|GEMINI_API_KEY/i.test(raw) || /not configured/i.test(raw)) {
    return 'AI agent is not configured. Add the selected provider API key and restart the server.';
  }
  if (/NVIDIA API 401|invalid.*api key|unauthorized/i.test(raw)) {
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
