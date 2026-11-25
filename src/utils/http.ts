import dns from 'node:dns/promises';
import net from 'node:net';
import { redactSecrets } from './redactor.js';

export interface ResilientFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Permit loopback/RFC1918/link-local hosts (default false to prevent SSRF CWE-918). */
  allowPrivateHosts?: boolean;
  /** Require HTTPS (default false when allowPrivateHosts is true, true otherwise). */
  requireHttps?: boolean;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']);

export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv4-mapped IPv6 addresses (::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.slice(7);
    if (net.isIPv4(mapped)) return isPrivateOrReservedIp(mapped);
    return true;
  }

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map((p) => Number.parseInt(p, 10));
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // AWS/GCP/Azure link-local metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (net.isIPv6(clean)) {
    if (clean === '::' || clean === '::1') return true;
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true; // Unique local
    if (/^fe[89ab]/.test(clean)) return true; // Link-local
    if (clean.startsWith('ff')) return true; // Multicast
    return false;
  }

  return false;
}

export function validateHttpUrl(
  rawUrl: string,
  options: { allowPrivateHosts?: boolean; requireHttps?: boolean } = {}
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${redactSecrets(rawUrl)}`);
  }

  const allowPrivate = options.allowPrivateHosts ?? false;
  const requireHttps = options.requireHttps ?? !allowPrivate;

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported URL protocol "${parsed.protocol}" (only http/https allowed)`);
  }
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new Error(`Cleartext HTTP is disallowed for outbound endpoint "${parsed.origin}" (HTTPS required)`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded URL credentials are disallowed; supply credentials via headers only.');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!allowPrivate) {
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      isPrivateOrReservedIp(host)
    ) {
      throw new Error(`Blocked SSRF target host "${host}" (private/loopback/metadata hosts disallowed)`);
    }
  }

  return parsed;
}

async function assertResolvedHostPublic(hostname: string): Promise<void> {
  const clean = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(clean)) {
    if (isPrivateOrReservedIp(clean)) {
      throw new Error(`Blocked SSRF IP target "${clean}"`);
    }
    return;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await dns.lookup(clean, { all: true });
  } catch {
    // Let fetch report DNS failure normally
    return;
  }
  for (const addr of addresses) {
    if (isPrivateOrReservedIp(addr.address)) {
      throw new Error(
        `Blocked SSRF DNS resolution for "${clean}" -> private/reserved IP "${addr.address}"`
      );
    }
  }
}

/**
 * Provider-scoped environment variable resolver (SEC-03):
 * Prevents untrusted workspace configs from reading arbitrary host env vars.
 */
export function resolveScopedEnvVar(
  configuredName: string | undefined,
  allowedPrefixes: string[],
  fallbackNames: string[]
): string | null {
  if (configuredName) {
    const validFormat = /^[A-Z][A-Z0-9_]{1,63}$/.test(configuredName);
    const allowed = allowedPrefixes.some((p) => configuredName.startsWith(p));
    if (validFormat && allowed && process.env[configuredName]) {
      return process.env[configuredName]!;
    }
  }
  for (const name of fallbackNames) {
    if (process.env[name]) return process.env[name]!;
  }
  return null;
}

function parseRetryAfterMs(headerVal: string | null): number | null {
  if (!headerVal) return null;
  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(30_000, seconds * 1000);
  }
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) {
    return Math.min(30_000, Math.max(0, dateMs - Date.now()));
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reads an HTTP response body with a strict streaming byte cap to prevent OOM DoS.
 */
export async function readResponseTextBounded(
  res: Response,
  maxBytes = 5_000_000
): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(`HTTP response exceeded maximum allowed size (${maxBytes} bytes)`);
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total).toString('utf8');
}

export async function readResponseJsonBounded<T>(
  res: Response,
  maxBytes = 5_000_000
): Promise<T> {
  const text = await readResponseTextBounded(res, maxBytes);
  return JSON.parse(text) as T;
}

/**
 * Production HTTP client wrapper enforcing:
 *  - URL scheme & SSRF private-IP/DNS validation (HTTPS required by default)
 *  - `redirect: 'error'` to prevent cross-origin auth-header leakage & redirect SSRF pivots
 *  - Non-idempotent `POST` defaults to `maxRetries = 0` (preventing duplicate remote creations)
 *  - Per-attempt timeout via AbortSignal.timeout
 *  - Exponential backoff + jitter + Retry-After honoring on 429/502/503/504
 *  - Secret-redacted error reporting
 */
export async function resilientFetch(
  rawUrl: string,
  options: ResilientFetchOptions
): Promise<Response> {
  const allowPrivate = options.allowPrivateHosts ?? false;
  const requireHttps = options.requireHttps ?? !allowPrivate;
  const url = validateHttpUrl(rawUrl, { allowPrivateHosts: allowPrivate, requireHttps });

  if (!allowPrivate) {
    await assertResolvedHostPublic(url.hostname);
  }

  const method = (options.method ?? 'GET').toUpperCase();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? (IDEMPOTENT_METHODS.has(method) ? 3 : 0);
  const baseDelayMs = options.baseDelayMs ?? 300;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: options.headers,
        body: options.body,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) {
        return res;
      }

      const retryAfter = parseRetryAfterMs(res.headers.get('retry-after'));
      const backoff = retryAfter ?? Math.min(10_000, baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 150));
      await res.body?.cancel().catch(() => {});
      await sleep(backoff);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`HTTP ${method} ${url.origin}${url.pathname} failed: ${redactSecrets(msg)}`);
      }
      const backoff = Math.min(10_000, baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 150));
      await sleep(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('HTTP request failed after retries');
}
