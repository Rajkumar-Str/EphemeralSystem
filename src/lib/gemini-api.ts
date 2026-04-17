export type GeminiModelConfig = {
  id: string;
  apiVersion: string;
};

export const DEFAULT_MODEL_API_VERSION = 'v1beta';

function ensureModelPath(modelId: string): string {
  const normalized = String(modelId || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/^models\//i, '');
  return normalized ? `models/${normalized}` : '';
}

function createModelConfig(modelId: string, apiVersion: string = DEFAULT_MODEL_API_VERSION): GeminiModelConfig {
  return {
    id: ensureModelPath(modelId),
    apiVersion: String(apiVersion || DEFAULT_MODEL_API_VERSION).trim() || DEFAULT_MODEL_API_VERSION,
  };
}

// Shared routing defaults. Runtime requests are executed only by legacy-engine.js.
export const GENERAL_CHAT_MODELS: ReadonlyArray<GeminiModelConfig> = Object.freeze([
  createModelConfig('gemini-3.1-flash-lite-preview'),
  createModelConfig('gemini-3-flash-preview'),
]);

export const WEB_GROUNDED_MODELS: ReadonlyArray<GeminiModelConfig> = Object.freeze([
  createModelConfig('gemini-2.5-flash-lite'),
  createModelConfig('gemini-2.5-flash'),
]);
