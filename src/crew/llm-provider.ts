import { NumberOneConfig } from '../core/types.js';
import {
  readResponseJsonBounded,
  resilientFetch,
  resolveScopedEnvVar
} from '../utils/http.js';
import { redactSecrets } from '../utils/redactor.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmProvider {
  readonly isAvailable: boolean;
  readonly providerName: string;
  complete(messages: LlmMessage[], maxTokens?: number): Promise<string | null>;
}

const SAFE_MODEL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:/-';
const SAFE_MODEL_ID_RX = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function normalizeLlmProvider(
  raw: unknown
): NonNullable<NumberOneConfig['llm']>['provider'] {
  if (raw === 'openai-compatible') return 'openai-compatible';
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'gemini') return 'gemini';
  return 'none';
}

export function sanitizeModelIdentifier(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!SAFE_MODEL_ID_RX.test(trimmed)) return fallback;
  let clean = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const idx = SAFE_MODEL_ALPHABET.indexOf(trimmed[i]!);
    if (idx === -1) return fallback;
    clean += SAFE_MODEL_ALPHABET[idx]!;
  }
  return clean;
}

/**
 * Harness-agnostic pluggable LLM provider.
 * Uses resilientFetch with strict timeouts, redirect:error, SSRF guards, provider-scoped
 * env-var resolution, header-only auth, bounded JSON body reading, and egress secret redaction.
 */
export class PluggableLlmProvider implements LlmProvider {
  private readonly provider: NonNullable<NumberOneConfig['llm']>['provider'];
  private readonly baseUrl?: string;
  private readonly model?: string;
  private readonly apiKeyEnvVar?: string;

  constructor(config?: NumberOneConfig['llm']) {
    this.provider = normalizeLlmProvider(config?.provider);
    this.baseUrl =
      typeof config?.baseUrl === 'string' && config.baseUrl.trim().length > 0
        ? config.baseUrl.trim()
        : undefined;
    const sanitizedModel = sanitizeModelIdentifier(config?.model, '');
    this.model = sanitizedModel.length > 0 ? sanitizedModel : undefined;
    this.apiKeyEnvVar =
      typeof config?.apiKeyEnvVar === 'string' && config.apiKeyEnvVar.trim().length > 0
        ? config.apiKeyEnvVar.trim()
        : undefined;
  }

  public get providerName(): string {
    return this.provider;
  }

  private resolveApiKey(): string | null {
    if (this.provider === 'none') return null;
    if (this.provider === 'openai-compatible') {
      return resolveScopedEnvVar(this.apiKeyEnvVar, ['OPENAI_', 'LLM_'], ['OPENAI_API_KEY']);
    }
    if (this.provider === 'anthropic') {
      return resolveScopedEnvVar(this.apiKeyEnvVar, ['ANTHROPIC_', 'LLM_'], ['ANTHROPIC_API_KEY']);
    }
    if (this.provider === 'gemini') {
      return resolveScopedEnvVar(
        this.apiKeyEnvVar,
        ['GEMINI_', 'GOOGLE_', 'LLM_'],
        ['GEMINI_API_KEY']
      );
    }
    return null;
  }

  public get isAvailable(): boolean {
    return this.provider !== 'none' && Boolean(this.resolveApiKey());
  }

  public async complete(messages: LlmMessage[], maxTokens = 600): Promise<string | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey || this.provider === 'none') return null;

    const redactedMessages = messages.map((m) => ({
      role: m.role,
      content: redactSecrets(m.content)
    }));

    try {
      if (this.provider === 'openai-compatible') {
        const base = (this.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
        const model = this.model ?? 'gpt-4o-mini';
        const res = await resilientFetch(`${base}/chat/completions`, {
          method: 'POST',
          timeoutMs: 20_000,
          maxRetries: 0,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: redactedMessages,
            max_tokens: maxTokens,
            temperature: 0.2
          })
        });
        if (!res.ok) return null;
        const json = await readResponseJsonBounded<{
          choices?: Array<{ message?: { content?: string } }>;
        }>(res, 2_000_000);
        return json.choices?.[0]?.message?.content?.trim() ?? null;
      }

      if (this.provider === 'anthropic') {
        const system = redactedMessages
          .filter((m) => m.role === 'system')
          .map((m) => m.content)
          .join('\n');
        const userMsgs = redactedMessages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content }));
        const base = (this.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
        const model = this.model ?? 'claude-3-5-sonnet-latest';
        const res = await resilientFetch(`${base}/v1/messages`, {
          method: 'POST',
          timeoutMs: 20_000,
          maxRetries: 0,
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            system,
            messages: userMsgs
          })
        });
        if (!res.ok) return null;
        const json = await readResponseJsonBounded<{
          content?: Array<{ type: string; text?: string }>;
        }>(res, 2_000_000);
        return json.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
      }

      if (this.provider === 'gemini') {
        const model = this.model ?? 'gemini-2.5-flash';
        const base = (this.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
        const combined = redactedMessages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
        // Pass API key via x-goog-api-key header (never in URL query string!)
        const res = await resilientFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          timeoutMs: 20_000,
          maxRetries: 0,
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: combined }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 }
          })
        });
        if (!res.ok) return null;
        const json = await readResponseJsonBounded<{
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        }>(res, 2_000_000);
        return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
      }
    } catch {
      return null;
    }
    return null;
  }
}
