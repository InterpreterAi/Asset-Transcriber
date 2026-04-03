/**
 * Single OpenAI client for API routes. Reads OPENAI_API_KEY when not using the Replit integration proxy.
 */
import OpenAI from "openai";

const hasIntegrationProxy = Boolean(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim());

export const openai = new OpenAI({
  baseURL: hasIntegrationProxy ? process.env.AI_INTEGRATIONS_OPENAI_BASE_URL : undefined,
  apiKey: hasIntegrationProxy
    ? (process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "placeholder")
    : (process.env.OPENAI_API_KEY ?? "placeholder"),
});
