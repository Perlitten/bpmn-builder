type AiProviderName = 'nvidia' | 'gemini';

export type ChatTurn = { role: 'user' | 'assistant'; text: string };

export type GenerateJsonInput = {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  signal?: AbortSignal;
};

export type AiModelClient = {
  provider: AiProviderName;
  model: string;
  generateJson(input: GenerateJsonInput): Promise<unknown>;
};

export type AiProviderInfo = {
  configured: boolean;
  provider: AiProviderName;
  model: string;
};
