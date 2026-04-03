/**
 * Single OpenAI client for API routes.
 * Replit proxy is used only when BOTH base URL and integration API key are set.
 * A lone AI_INTEGRATIONS_OPENAI_BASE_URL (e.g. stale template on Railway) would
 * otherwise send traffic to the wrong host while OPENAI_API_KEY is set.
 */
import OpenAI from "openai";

const baseUrl        = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
const openaiKey      = process.env.OPENAI_API_KEY?.trim();

const hasIntegrationProxy = Boolean(baseUrl && integrationKey);

export const openai = new OpenAI({
  baseURL: hasIntegrationProxy ? baseUrl : undefined,
  apiKey: hasIntegrationProxy
    ? (integrationKey ?? openaiKey ?? "placeholder")
    : (openaiKey ?? "placeholder"),
});
