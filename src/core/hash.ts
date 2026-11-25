import { createHash } from 'node:crypto';

const MAX_CANONICAL_DEPTH = 64;

function serializeCanonical(value: unknown, depth: number, inArray: boolean): string | undefined {
  if (depth > MAX_CANONICAL_DEPTH) {
    throw new Error(`canonicalJson: maximum nesting depth (${MAX_CANONICAL_DEPTH}) exceeded`);
  }

  if (value !== null && typeof value === 'object') {
    const maybeToJson = (value as { toJSON?: unknown }).toJSON;
    if (typeof maybeToJson === 'function') {
      return serializeCanonical(maybeToJson.call(value), depth + 1, inArray);
    }
  }

  if (value === null) return 'null';

  const t = typeof value;
  if (t === 'bigint') {
    throw new TypeError('canonicalJson: BigInt values are not JSON-serializable');
  }
  if (t === 'undefined' || t === 'function' || t === 'symbol') {
    return inArray ? 'null' : undefined;
  }
  if (t === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (t === 'boolean' || t === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => serializeCanonical(item, depth + 1, true) ?? 'null');
    return '[' + items.join(',') + ']';
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs: string[] = [];
  for (const k of keys) {
    const serialized = serializeCanonical(obj[k], depth + 1, false);
    if (serialized !== undefined) {
      pairs.push(`${JSON.stringify(k)}:${serialized}`);
    }
  }
  return '{' + pairs.join(',') + '}';
}

/**
 * Deterministic canonical JSON serialization with recursively sorted object keys.
 * Strictly matches JSON.stringify semantics so in-memory hashes always equal on-disk reload hashes.
 */
export function canonicalJson(value: unknown): string {
  const out = serializeCanonical(value, 0, false);
  if (out === undefined) {
    throw new TypeError('canonicalJson: top-level value is not JSON-serializable');
  }
  return out;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashObject(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export const GENESIS_HASH = '0'.repeat(64);
