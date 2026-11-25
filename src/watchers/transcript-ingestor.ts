import path from 'node:path';
import { StreamStore } from '../core/stream-store.js';
import { StreamEvent } from '../core/types.js';
import { readTextFileSafe } from '../utils/fs-helpers.js';
import { isSensitiveSecretFile, redactSecrets } from '../utils/redactor.js';

export interface IngestTranscriptOptions {
  filePath: string;
  harness?: string;
  sessionId?: string;
  maxFileBytes?: number;
}

export interface IngestResult {
  filePath: string;
  detectedFormat: 'jsonl' | 'markdown';
  eventsIngested: StreamEvent[];
  thinkingCount: number;
  failedAttemptCount: number;
  lessonCount: number;
  decisionCount: number;
}

const THINKING_HINTS = /\b(thinking|hypothesis|tried|investigat|root cause|dead[- ]end|turns out|realized|wait,)\b/i;
const FAILED_HINTS = /\b(failed|didn't work|did not work|dead end|broke|crashed|reverted|abandoned)\b/i;
const LESSON_HINTS = /\b(lesson learned|never do|always ensure|note to self|takeaway|invariant|root cause was)\b/i;
const DECISION_HINTS = /(?:\bdecided to\b|\bdecision:|\bwe chose\b|\barchitecture decision\b|\bgoing with\b)/i;

function extractPathsFromText(text: string): string[] {
  const matches = text.match(/\b[a-zA-Z0-9_./-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|yml|yaml|json|md|tf|dockerfile)\b/gi) ?? [];
  return Array.from(new Set(matches.map((m) => m.replace(/^\.\//, '')))).slice(0, 10);
}

function normalizeIsoTimestamp(rawTs: unknown): string | undefined {
  if (typeof rawTs !== 'string' || !rawTs.trim()) return undefined;
  const parsed = Date.parse(rawTs);
  if (Number.isNaN(parsed)) return undefined;
  return new Date(parsed).toISOString();
}

function parseJsonTranscriptObjects(raw: string): Record<string, unknown>[] {
  const objects: Record<string, unknown>[] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().startsWith('{'));
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        objects.push(parsed as Record<string, unknown>);
      }
    } catch {
      // May be pretty-printed multi-line JSON — handled by whole-document fallback below
    }
  }
  if (objects.length > 0) return objects;

  // Fallback: whole-document JSON (single object, array of turns, or { messages/events: [...] })
  try {
    const doc = JSON.parse(raw) as unknown;
    if (Array.isArray(doc)) {
      return doc.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
    }
    if (doc && typeof doc === 'object') {
      const rec = doc as Record<string, unknown>;
      const nestedList = Array.isArray(rec.messages)
        ? rec.messages
        : Array.isArray(rec.turns)
          ? rec.turns
          : Array.isArray(rec.events)
            ? rec.events
            : null;
      if (nestedList) {
        return nestedList.filter(
          (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item))
        );
      }
      return [rec];
    }
  } catch {
    // not valid JSON
  }
  return [];
}

/**
 * Harness-agnostic transcript & chat log ingestor.
 * Preserves intermediate thinking, dead-ends, decisions, and lessons learned across
 * Claude Code, Cursor, Antigravity/Gemini, Codex, Copilot, and raw human markdown notes.
 */
export function ingestTranscriptFile(store: StreamStore, options: IngestTranscriptOptions): IngestResult {
  const absPath = path.resolve(options.filePath);
  if (isSensitiveSecretFile(absPath)) {
    throw new Error(`Refusing to ingest sensitive secret/credential file as transcript: ${absPath}`);
  }
  const maxBytes = options.maxFileBytes ?? 25 * 1024 * 1024;
  // FD-based safe read (O_NOFOLLOW | O_NONBLOCK): blocks symlinks, FIFOs, and oversized files atomically
  const raw = readTextFileSafe(absPath, maxBytes);
  if (raw === null) {
    throw new Error(
      `Transcript path could not be read as a regular non-symlink UTF-8 file within ${maxBytes} bytes: ${absPath}`
    );
  }

  const sessionId = options.sessionId ?? `transcript-${path.basename(absPath, path.extname(absPath))}`;
  const harness = options.harness ?? detectHarnessFromPath(absPath);

  const trimmedStart = raw.trimStart();
  const isJsonLike =
    absPath.endsWith('.jsonl') ||
    absPath.endsWith('.json') ||
    trimmedStart.startsWith('{') ||
    trimmedStart.startsWith('[');
  const eventsIngested: StreamEvent[] = [];
  let thinkingCount = 0;
  let failedAttemptCount = 0;
  let lessonCount = 0;
  let decisionCount = 0;

  if (isJsonLike) {
    const objects = parseJsonTranscriptObjects(raw);
    if (objects.length > 0 || absPath.endsWith('.jsonl') || absPath.endsWith('.json')) {
      for (const obj of objects) {
        const role = String(obj.role ?? obj.source ?? obj.type ?? 'unknown').toLowerCase();
        const timestamp = normalizeIsoTimestamp(obj.created_at ?? obj.timestamp);

        // 1. Capture explicit intermediate thinking block (redact BEFORE slicing!)
        const rawThinking = typeof obj.thinking === 'string' ? obj.thinking.trim() : '';
        const thinkingText = rawThinking ? redactSecrets(rawThinking) : '';
        if (thinkingText) {
          const ev = store.append({
            type: 'chat.thinking',
            actor: { kind: 'ai-agent', id: harness, name: harness },
            harness,
            sessionId,
            timestamp,
            summary: `Thinking: ${thinkingText.slice(0, 140)}`,
            affectedPaths: extractPathsFromText(thinkingText),
            tags: ['transcript', 'thinking'],
            payload: { thought: thinkingText.slice(0, 4000), sourceFile: absPath },
            fallbackBlobs:
              thinkingText.length > 4000
                ? [{ key: 'fullThinking', content: thinkingText, contentType: 'text/plain; charset=utf-8' }]
                : []
          });
          eventsIngested.push(ev);
          thinkingCount++;
        }

        const rawContent = extractContentField(obj);
        if (!rawContent) continue;
        const contentText = redactSecrets(rawContent);
        const paths = extractPathsFromText(contentText);

        // 2. Detect explicit failed attempts
        if (FAILED_HINTS.test(contentText) && contentText.length < 3000) {
          const ev = store.append({
            type: 'attempt.failed',
            actor: role.includes('user')
              ? { kind: 'human', id: 'user' }
              : { kind: 'ai-agent', id: harness },
            harness,
            sessionId,
            timestamp,
            summary: `Failed approach noted: ${contentText.slice(0, 140)}`,
            affectedPaths: paths,
            tags: ['transcript', 'failed-attempt'],
            payload: { approach: contentText.slice(0, 500), reason: contentText.slice(0, 1000) }
          });
          eventsIngested.push(ev);
          failedAttemptCount++;
        }

        // 3. Detect explicit lessons learned
        if (LESSON_HINTS.test(contentText)) {
          const ev = store.append({
            type: 'lesson.captured',
            actor: { kind: 'numberone', id: 'transcript-ingestor', name: 'Number One Ingestor' },
            harness,
            sessionId,
            timestamp,
            summary: `Lesson from ${harness}: ${contentText.slice(0, 120)}`,
            affectedPaths: paths,
            tags: ['transcript', 'lesson', harness],
            payload: {
              title: `Lesson from ${harness} (${sessionId})`,
              problem: contentText.slice(0, 600),
              rootCause: thinkingText ? thinkingText.slice(0, 600) : 'Extracted from session transcript',
              resolution: contentText.slice(0, 600),
              preventionRule: contentText.slice(0, 400),
              severity: 'medium',
              verified: false
            }
          });
          eventsIngested.push(ev);
          lessonCount++;
        }

        // 4. Detect decisions
        if (DECISION_HINTS.test(contentText)) {
          const ev = store.append({
            type: 'decision.recorded',
            actor: role.includes('user')
              ? { kind: 'human', id: 'user' }
              : { kind: 'ai-agent', id: harness },
            harness,
            sessionId,
            timestamp,
            summary: `Decision from ${harness}: ${contentText.slice(0, 120)}`,
            affectedPaths: paths,
            tags: ['transcript', 'decision', harness],
            payload: {
              title: contentText.slice(0, 100),
              decision: contentText.slice(0, 800),
              rationale: thinkingText.slice(0, 600) || 'Recorded during conversation'
            }
          });
          eventsIngested.push(ev);
          decisionCount++;
        }

        // 5. Record conversational turn
        const turnEv = store.append({
          type: 'chat.turn',
          actor: role.includes('user')
            ? { kind: 'human', id: 'user' }
            : { kind: 'ai-agent', id: harness },
          harness,
          sessionId,
          timestamp,
          summary: `[${role}] ${contentText.slice(0, 140)}`,
          affectedPaths: paths,
          tags: ['transcript', 'chat', harness],
          payload: { role, contentExcerpt: contentText.slice(0, 2000) },
          fallbackBlobs:
            contentText.length > 2000
              ? [{ key: 'fullTurn', content: contentText, contentType: 'text/plain; charset=utf-8' }]
              : []
        });
        eventsIngested.push(turnEv);
      }

      return {
        filePath: absPath,
        detectedFormat: 'jsonl',
        eventsIngested,
        thinkingCount,
        failedAttemptCount,
        lessonCount,
        decisionCount
      };
    }
  }

  // Markdown / Plain text transcript ingestion (redact entire blocks BEFORE slicing!)
  const blocks = raw.split(/\n{2,}/).map((b) => redactSecrets(b.trim())).filter(Boolean);
  for (const block of blocks) {
    const paths = extractPathsFromText(block);
    if (/^(thinking|thought|analysis):/i.test(block) || THINKING_HINTS.test(block)) {
      const ev = store.append({
        type: 'chat.thinking',
        actor: { kind: 'ai-agent', id: harness },
        harness,
        sessionId,
        summary: `Thinking: ${block.slice(0, 140)}`,
        affectedPaths: paths,
        tags: ['transcript', 'thinking'],
        payload: { thought: block.slice(0, 4000) }
      });
      eventsIngested.push(ev);
      thinkingCount++;
    }
    if (/^(failed|dead[- ]end):/i.test(block) || FAILED_HINTS.test(block)) {
      const ev = store.append({
        type: 'attempt.failed',
        actor: { kind: 'human', id: 'operator' },
        harness,
        sessionId,
        summary: `Failed attempt: ${block.slice(0, 140)}`,
        affectedPaths: paths,
        tags: ['transcript', 'failed-attempt'],
        payload: { approach: block.slice(0, 400), reason: block.slice(0, 800) }
      });
      eventsIngested.push(ev);
      failedAttemptCount++;
    }
    if (/^(lesson|lesson learned):/i.test(block) || LESSON_HINTS.test(block)) {
      const ev = store.append({
        type: 'lesson.captured',
        actor: { kind: 'numberone', id: 'transcript-ingestor' },
        harness,
        sessionId,
        summary: `Lesson: ${block.slice(0, 120)}`,
        affectedPaths: paths,
        tags: ['transcript', 'lesson'],
        payload: {
          title: block.slice(0, 90),
          problem: block.slice(0, 500),
          rootCause: 'Extracted from markdown session notes',
          resolution: block.slice(0, 500),
          preventionRule: block.slice(0, 400),
          severity: 'medium',
          verified: false
        }
      });
      eventsIngested.push(ev);
      lessonCount++;
    }
    if (/^(decision|adr):/i.test(block) || DECISION_HINTS.test(block)) {
      const ev = store.append({
        type: 'decision.recorded',
        actor: { kind: 'human', id: 'operator' },
        harness,
        sessionId,
        summary: `Decision: ${block.slice(0, 120)}`,
        affectedPaths: paths,
        tags: ['transcript', 'decision'],
        payload: {
          title: block.slice(0, 90),
          decision: block.slice(0, 600),
          rationale: 'Extracted from session transcript'
        }
      });
      eventsIngested.push(ev);
      decisionCount++;
    }
  }

  return {
    filePath: absPath,
    detectedFormat: 'markdown',
    eventsIngested,
    thinkingCount,
    failedAttemptCount,
    lessonCount,
    decisionCount
  };
}

function detectHarnessFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('claude')) return 'claude-code';
  if (lower.includes('cursor')) return 'cursor';
  if (lower.includes('gemini') || lower.includes('jetski') || lower.includes('antigravity')) return 'antigravity';
  if (lower.includes('windsurf')) return 'windsurf';
  if (lower.includes('copilot')) return 'copilot';
  if (lower.includes('codex')) return 'codex';
  return 'transcript';
}

function extractContentField(obj: Record<string, unknown>): string {
  if (typeof obj.content === 'string') return obj.content.trim();
  if (Array.isArray(obj.content)) {
    return obj.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof obj.message === 'string') return obj.message.trim();
  if (obj.message && typeof obj.message === 'object') {
    return extractContentField(obj.message as Record<string, unknown>);
  }
  return '';
}
