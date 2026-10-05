/**
 * GeminiConfig.ts
 * Centralized Gemini configuration repository.
 * Eliminates scattered model strings across screens, security, services, and parsers.
 * Uses official, verified Google Gemini model identifiers.
 */

export interface GeminiModelDefinition {
  id: string;
  name: string;
  description: string;
  recommendedFor: string;
  isDefault?: boolean;
}

export const GEMINI_MODELS = {
  PRIMARY: {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    description: 'Flagship workhorse model. Balanced, fast, and highly accurate for multimodal receipt extraction and structured finance parsing.',
    recommendedFor: 'Receipts, SMS Fallback & Monthly Insights',
    isDefault: true,
  },
  LIGHTWEIGHT: {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    description: 'Ultra-low latency and highly cost-efficient model. Ideal for quota-constrained free API keys and fast categorization.',
    recommendedFor: 'Quota Conservation & Fast SMS Parsing',
  },
  MULTIMODAL_HIGH_EFFICIENCY: {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'High-efficiency multimodal model with strong visual reasoning capabilities.',
    recommendedFor: 'Complex Paper Receipts & Low-Quality Slips',
  },
} as const;

export const DEFAULT_GEMINI_MODEL_ID: string = GEMINI_MODELS.PRIMARY.id;

export const SUPPORTED_GEMINI_MODELS: GeminiModelDefinition[] = [
  GEMINI_MODELS.PRIMARY,
  GEMINI_MODELS.LIGHTWEIGHT,
  GEMINI_MODELS.MULTIMODAL_HIGH_EFFICIENCY,
];

export function isValidGeminiModel(modelId: string): boolean {
  return SUPPORTED_GEMINI_MODELS.some((m) => m.id === modelId);
}

export function getGeminiModelDefinition(modelId: string): GeminiModelDefinition {
  return (
    SUPPORTED_GEMINI_MODELS.find((m) => m.id === modelId) || GEMINI_MODELS.PRIMARY
  );
}
