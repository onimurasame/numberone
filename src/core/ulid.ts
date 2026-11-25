import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIME = 2 ** 48 - 1;

let lastTime = -1;
const lastRandom = new Uint8Array(10);

function encodeTime(time: number, length = 10): string {
  if (!Number.isFinite(time) || time < 0 || time > MAX_TIME) {
    throw new RangeError(`ULID timestamp out of range: ${time}`);
  }
  let remaining = Math.floor(time);
  let out = '';
  for (let i = length - 1; i >= 0; i--) {
    const mod = remaining % 32;
    out = CROCKFORD[mod]! + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(buffer >>> bits) & 0x1f]!;
    }
  }
  return out;
}

function incrementRandom(bytes: Uint8Array): boolean {
  for (let i = bytes.length - 1; i >= 0; i--) {
    if (bytes[i]! < 255) {
      bytes[i] = bytes[i]! + 1;
      return true;
    }
    bytes[i] = 0;
  }
  return false; // 80-bit overflow
}

/**
 * Generates a strictly monotonic, lexicographically sortable 26-char ULID,
 * resilient to backward NTP clock skew (`now <= lastTime`).
 */
export function generateUlid(now = Date.now()): string {
  if (!Number.isFinite(now)) {
    throw new RangeError(`ULID timestamp out of range: ${now}`);
  }
  let effectiveTime = Math.floor(now);
  if (effectiveTime < 0 || effectiveTime > MAX_TIME) {
    throw new RangeError(`ULID timestamp out of range: ${effectiveTime}`);
  }

  if (effectiveTime <= lastTime) {
    effectiveTime = lastTime;
    const candidateRandom = new Uint8Array(lastRandom);
    const incremented = incrementRandom(candidateRandom);
    if (!incremented) {
      // Extremely rare 80-bit overflow within same millisecond: advance logical time by 1ms
      if (lastTime + 1 > MAX_TIME) {
        throw new RangeError('ULID logical timestamp overflowed MAX_TIME');
      }
      effectiveTime = lastTime + 1;
      lastTime = effectiveTime;
      lastRandom.set(randomBytes(10));
    } else {
      lastRandom.set(candidateRandom);
    }
  } else {
    lastTime = effectiveTime;
    lastRandom.set(randomBytes(10));
  }
  return encodeTime(effectiveTime, 10) + encodeRandom(lastRandom);
}
