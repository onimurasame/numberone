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

/**
 * Harness-agnostic pluggable LLM provider.
 * Uses resilientFetch with strict timeouts, redirect:error, SSRF guards, provider-scoped
 * env-var resolution, header-only auth, bounded JSON body reading, and egress secret redaction.
 */
export class PluggableLlmProvider implements LlmProvider {
  private readonly cfg: NonNullable<NumberOneConfig['llm']>;

  constructor(config?: NumberOneConfig['llm']) {
    this.cfg = config ?? { provider: 'none' };
  }

  public get providerName(): string {
    return this.cfg.provider;
  }

  private resolveApiKey(): string | null {
    if (this.cfg.provider === 'none') return null;
    if (this.cfg.provider === 'openai-compatible') {
      return resolveScopedEnvVar(this.cfg.apiKeyEnvVar, ['OPENAI_', 'LLM_'], ['OPENAI_API_KEY']);
    }
    if (this.cfg.provider === 'anthropic') {
      return resolveScopedEnvVar(this.cfg.apiKeyEnvVar, ['ANTHROPIC_', 'LLM_'], ['ANTHROPIC_API_KEY']);
    }
    if (this.cfg.provider === 'gemini') {
      return resolveScopedEnvVar(
        this.cfg.apiKeyEnvVar,
        ['GEMINI_', 'GOOGLE_', 'LLM_'],
        ['GEMINI_API_KEY']
      );
    }
    return null;
  }

  public get isAvailable(): boolean {
    return this.cfg.provider !== 'none' && Boolean(this.resolveApiKey());
  }

  public async complete(messages: LlmMessage[], maxTokens = 600): Promise<string | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey || this.cfg.provider === 'none') return null;

    const redactedMessages = messages.map((m) => ({
      role: m.role,
      content: redactSecrets(m.content)
    }));

    try {
      if (this.cfg.provider === 'openai-compatible') {
        const base = (this.cfg.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
        const res = await resilientFetch(`${base}/chat/completions`, {
          method: 'POST',
          timeoutMs: 20_000,
          maxRetries: 0,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: this.cfg.model ?? 'gpt-4o-mini',
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

      if (this.cfg.provider === 'anthropic') {
        const system = redactedMessages
          .filter((m) => m.role === 'system')
          .map((m) => m.content)
          .join('\n');
        const userMsgs = redactedMessages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content }));
        const base = (this.cfg.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
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
            model: this.cfg.model ?? 'claude-3-5-sonnet-latest',
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

      if (this.cfg.provider === 'gemini') {
        const model = this.cfg.model ?? 'gemini-2.5-flash';
        const base = (this.cfg.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
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
