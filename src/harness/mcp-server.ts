import fs from 'node:fs';
import { OfficerRole } from '../core/types.js';
import { KnowledgeUpdateProposal } from '../crew/types.js';
import { redactSecrets } from '../utils/redactor.js';
import { NumberOneAgent } from './number-one.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Non-privileged stream event types that an L4 AI session over MCP may record directly.
 * Privileged SoR / Officer / Execution / Directive mutations MUST flow through their
 * dedicated validated engines or local operator CLI — never forged raw via MCP.
 */
const MCP_ALLOWED_RECORD_TYPES = new Set<string>([
  'chat.turn',
  'chat.thinking',
  'attempt.failed',
  'issue.opened',
  'issue.updated',
  'decision.recorded'
]);

function loadPackageVersion(): string {
  try {
    const raw = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // fallback
  }
  return '1.0.0';
}

const SERVER_VERSION = loadPackageVersion();

const MCP_TOOLS = [
  {
    name: 'get_authoritative_brief',
    description:
      'Returns Number One authoritative System of Record (SoR) context brief. Supersedes ephemeral session context.',
    inputSchema: {
      type: 'object',
      properties: {
        focusPaths: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'consult_number_one',
    description:
      'Consults institutional memory (lessons learned, past failed attempts, unresolved crashes, active directives) before acting to avoid reinventing the wheel.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string' },
        targetPaths: { type: 'array', items: { type: 'string' } },
        errorText: { type: 'string' },
        command: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'arbitrate_action',
    description:
      'Submits a proposed plan, command, or edit for authoritative Number One arbitration. Returns APPROVE, APPROVE_WITH_CONDITIONS, OVERRIDE, or BLOCK.',
    inputSchema: {
      type: 'object',
      required: ['action', 'intent'],
      properties: {
        action: { type: 'string' },
        intent: { type: 'string' },
        targetPaths: { type: 'array', items: { type: 'string' } },
        command: { type: 'string' },
        proposedApproach: { type: 'string' },
        sessionAssumptions: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        harness: { type: 'string' },
        recordAuditEvent: { type: 'boolean' }
      }
    }
  },
  {
    name: 'record_stream_event',
    description:
      'Appends an immutable non-privileged event (chat.turn, chat.thinking, attempt.failed, issue.opened, issue.updated, decision.recorded) to the workspace stream.',
    inputSchema: {
      type: 'object',
      required: ['type', 'summary'],
      properties: {
        type: {
          type: 'string',
          enum: Array.from(MCP_ALLOWED_RECORD_TYPES)
        },
        summary: { type: 'string' },
        harness: { type: 'string' },
        sessionId: { type: 'string' },
        affectedPaths: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        payload: { type: 'object' }
      }
    }
  },
  {
    name: 'capture_lesson',
    description: 'Records a durable Lesson Learned including root cause, failed approaches to avoid, and prevention rule.',
    inputSchema: {
      type: 'object',
      required: ['title', 'problem', 'rootCause', 'resolution', 'preventionRule'],
      properties: {
        title: { type: 'string' },
        problem: { type: 'string' },
        rootCause: { type: 'string' },
        resolution: { type: 'string' },
        preventionRule: { type: 'string' },
        failedApproaches: { type: 'array', items: { type: 'string' } },
        errorSignatures: { type: 'array', items: { type: 'string' } },
        affectedPaths: { type: 'array', items: { type: 'string' } },
        tags: { type: 'array', items: { type: 'string' } },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
      }
    }
  },
  {
    name: 'issue_directive',
    description:
      'Records an advisory directive proposal from an MCP session (blocking/mandatory L2 directives require Number One crew consensus or trusted local CLI).',
    inputSchema: {
      type: 'object',
      required: ['title', 'directive', 'rationale'],
      properties: {
        title: { type: 'string' },
        directive: { type: 'string' },
        rationale: { type: 'string' },
        scopePaths: { type: 'array', items: { type: 'string' } },
        scopeTags: { type: 'array', items: { type: 'string' } },
        forbiddenPatterns: { type: 'array', items: { type: 'string' } },
        requiredPatterns: { type: 'array', items: { type: 'string' } },
        severity: { type: 'string', enum: ['advisory'] }
      }
    }
  },
  {
    name: 'replay_workspace_state',
    description: 'Deterministically replays the event stream from genesis (or time-travels via untilSeq/untilTimestamp).',
    inputSchema: {
      type: 'object',
      properties: {
        untilSeq: { type: 'number' },
        untilTimestamp: { type: 'string' }
      }
    }
  },
  {
    name: 'get_documentary',
    description: 'Generates the chronological Documentary of the Workspace spanning sessions, harnesses, crashes, and lessons.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'assemble_crew',
    description:
      'Assembles Number One Bridge Crew in BMAD Party Mode (Engineering Officer, Security Officer, Bridge Officer) to audit, cross-verify challenges, and emit an authoritative ruling and remediation plan.',
    inputSchema: {
      type: 'object',
      required: ['topic'],
      properties: {
        topic: { type: 'string' },
        mode: { type: 'string', enum: ['roundtable', 'specialist', 'auto-triage'] },
        officers: { type: 'array', items: { type: 'string', enum: ['engineering', 'security', 'bridge'] } },
        targetPaths: { type: 'array', items: { type: 'string' } }
      }
    }
  },
  {
    name: 'propose_officer_evolution',
    description:
      'Submits a factually-proven expertise update for a Bridge Crew officer. Accepted ONLY if proven to increase that officer main KPI (shell benchmark execution disabled over MCP).',
    inputSchema: {
      type: 'object',
      required: ['officer', 'practice', 'proof'],
      properties: {
        officer: { type: 'string', enum: ['engineering', 'security', 'bridge'] },
        practice: { type: 'object' },
        proof: { type: 'object' }
      }
    }
  },
  {
    name: 'sync_persistence',
    description: 'Synchronizes distributed stream with configured GitHub/Jira Scrum backends while maintaining .numberone fallback integrity.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['push', 'pull', 'both'] }
      }
    }
  },
  {
    name: 'verify_integrity',
    description: 'Verifies cryptographic hash chain, fallback blobs, and distributed persistence integrity.',
    inputSchema: {
      type: 'object',
      properties: {
        verifyRemotes: { type: 'boolean' }
      }
    }
  }
];

const MCP_RESOURCES = [
  {
    uri: 'numberone://brief',
    name: 'Number One Authoritative SoR Brief',
    description: 'Authoritative workspace briefing superseding ephemeral session context',
    mimeType: 'text/markdown'
  },
  {
    uri: 'numberone://state',
    name: 'Replayed Workspace Projection',
    description: 'Deterministically replayed workspace state JSON',
    mimeType: 'application/json'
  },
  {
    uri: 'numberone://documentary',
    name: 'Workspace Documentary',
    description: 'Chronological documentary of everything that happened in the workspace',
    mimeType: 'text/markdown'
  },
  {
    uri: 'numberone://lessons',
    name: 'Institutional Memory Lessons',
    description: 'Captured lessons learned and dead-ends avoided',
    mimeType: 'application/json'
  }
];

/**
 * Harness-agnostic Model Context Protocol (MCP) JSON-RPC 2.0 server.
 * Any MCP-compatible harness (Claude Code, Cursor, Windsurf, Antigravity, Copilot, Zed, etc.)
 * can attach directly to Number One over stdio.
 *
 * Security & Transport Guarantees:
 *  - Pre-newline raw Buffer framing enforces `maxLineBytes` BEFORE UTF-8 string allocation
 *  - Stdin pause/resume backpressure and EPIPE-safe stdout writes
 *  - Strict L4 privilege boundary: blocks raw forging of SoR/officer/directive/exec events
 */
export class NumberOneMcpServer {
  private readonly agent: NumberOneAgent;

  constructor(agent: NumberOneAgent) {
    this.agent = agent;
  }

  public async handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (!req || typeof req !== 'object' || typeof req.method !== 'string') {
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request: expected JSON-RPC object with string method' }
      };
    }

    // JSON-RPC 2.0: any message lacking an `id` member (or explicit notifications/*) is a notification
    const isNotification =
      !Object.prototype.hasOwnProperty.call(req, 'id') ||
      req.method === 'notifications/initialized' ||
      req.method.startsWith('notifications/');
    if (isNotification) {
      return null;
    }

    const id = req.id ?? null;

    try {
      switch (req.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: {},
                resources: {}
              },
              serverInfo: {
                name: 'numberone',
                version: SERVER_VERSION
              }
            }
          };

        case 'ping':
          return { jsonrpc: '2.0', id, result: {} };

        case 'tools/list':
          return { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } };

        case 'tools/call': {
          const params = req.params ?? {};
          const name = String(params.name ?? '');
          const args = (params.arguments ?? {}) as Record<string, unknown>;
          const result = await this.dispatchTool(name, args);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                }
              ]
            }
          };
        }

        case 'resources/list':
          return { jsonrpc: '2.0', id, result: { resources: MCP_RESOURCES } };

        case 'resources/read': {
          const uri = String(req.params?.uri ?? '');
          const content = this.readResource(uri);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [content]
            }
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${req.method}` }
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: redactSecrets(err instanceof Error ? err.message : String(err))
        }
      };
    }
  }

  private readResource(uri: string): { uri: string; mimeType: string; text: string } {
    if (!this.agent.store.isInitialized()) {
      throw new Error(
        `Workspace is not attached to Number One (.numberone/ not initialized). Run \`n1 attach\` first.`
      );
    }
    if (uri === 'numberone://brief') {
      return { uri, mimeType: 'text/markdown', text: this.agent.getAuthoritativeBrief() };
    }
    if (uri === 'numberone://state') {
      return { uri, mimeType: 'application/json', text: JSON.stringify(this.agent.getState(), null, 2) };
    }
    if (uri === 'numberone://documentary') {
      return { uri, mimeType: 'text/markdown', text: this.agent.buildDocumentary().markdown };
    }
    if (uri === 'numberone://lessons') {
      const state = this.agent.getState();
      return { uri, mimeType: 'application/json', text: JSON.stringify(Object.values(state.lessons), null, 2) };
    }
    throw new Error(`Unknown resource URI: ${uri}`);
  }

  private async dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.agent.store.isInitialized()) {
      this.agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0, harness: 'mcp' });
    }

    switch (name) {
      case 'get_authoritative_brief':
        return this.agent.getAuthoritativeBrief(
          Array.isArray(args.focusPaths) ? (args.focusPaths as string[]) : []
        );

      case 'consult_number_one':
        return this.agent.consult({
          intent: typeof args.intent === 'string' ? args.intent : undefined,
          targetPaths: Array.isArray(args.targetPaths) ? (args.targetPaths as string[]) : undefined,
          errorText: typeof args.errorText === 'string' ? args.errorText : undefined,
          command: typeof args.command === 'string' ? args.command : undefined,
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : undefined
        });

      case 'arbitrate_action':
        return this.agent.arbitrate(
          {
            action: String(args.action ?? ''),
            intent: String(args.intent ?? ''),
            targetPaths: Array.isArray(args.targetPaths) ? (args.targetPaths as string[]) : [],
            command: typeof args.command === 'string' ? args.command : undefined,
            proposedApproach: typeof args.proposedApproach === 'string' ? args.proposedApproach : undefined,
            sessionAssumptions: Array.isArray(args.sessionAssumptions)
              ? (args.sessionAssumptions as string[])
              : undefined,
            tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
            harness: typeof args.harness === 'string' ? args.harness : 'mcp'
          },
          { recordAuditEvent: args.recordAuditEvent !== false }
        );

      case 'record_stream_event': {
        const rawType = String(args.type ?? '');
        if (!MCP_ALLOWED_RECORD_TYPES.has(rawType)) {
          throw new Error(
            `Event type "${rawType}" is privileged and cannot be forged directly via MCP. Allowed MCP event types: ${Array.from(MCP_ALLOWED_RECORD_TYPES).join(', ')}.`
          );
        }
        return this.agent.recordEvent({
          type: rawType as
            | 'chat.turn'
            | 'chat.thinking'
            | 'attempt.failed'
            | 'issue.opened'
            | 'issue.updated'
            | 'decision.recorded',
          actor: { kind: 'ai-agent', id: typeof args.harness === 'string' ? args.harness : 'mcp-client' },
          harness: typeof args.harness === 'string' ? args.harness : 'mcp',
          sessionId: typeof args.sessionId === 'string' ? args.sessionId : undefined,
          summary: String(args.summary ?? ''),
          affectedPaths: Array.isArray(args.affectedPaths) ? (args.affectedPaths as string[]) : [],
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
          payload: (args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload)
            ? args.payload
            : {}) as Record<string, unknown>
        });
      }

      case 'capture_lesson':
        return this.agent.captureLesson({
          title: String(args.title ?? ''),
          problem: String(args.problem ?? ''),
          rootCause: String(args.rootCause ?? ''),
          resolution: String(args.resolution ?? ''),
          preventionRule: String(args.preventionRule ?? ''),
          failedApproaches: Array.isArray(args.failedApproaches) ? (args.failedApproaches as string[]) : [],
          errorSignatures: Array.isArray(args.errorSignatures) ? (args.errorSignatures as string[]) : [],
          affectedPaths: Array.isArray(args.affectedPaths) ? (args.affectedPaths as string[]) : [],
          tags: Array.isArray(args.tags) ? (args.tags as string[]) : [],
          severity:
            args.severity === 'low' ||
            args.severity === 'medium' ||
            args.severity === 'high' ||
            args.severity === 'critical'
              ? args.severity
              : 'medium',
          verified: false,
          harness: 'mcp'
        });

      case 'issue_directive':
        // Security (L1 > L2 > L4 hierarchy): untrusted MCP sessions may only submit
        // advisory directives attributed to `ai-agent` — never L2 blocking/mandatory gates!
        return this.agent.issueDirective({
          title: String(args.title ?? ''),
          directive: String(args.directive ?? ''),
          rationale: String(args.rationale ?? ''),
          scopePaths: Array.isArray(args.scopePaths) ? (args.scopePaths as string[]) : [],
          scopeTags: Array.isArray(args.scopeTags) ? (args.scopeTags as string[]) : [],
          forbiddenPatterns: Array.isArray(args.forbiddenPatterns) ? (args.forbiddenPatterns as string[]) : [],
          requiredPatterns: Array.isArray(args.requiredPatterns) ? (args.requiredPatterns as string[]) : [],
          severity: 'advisory',
          actor: { kind: 'ai-agent', id: 'mcp-client' },
          harness: 'mcp'
        });

      case 'replay_workspace_state':
        return this.agent.replay({
          untilSeq: typeof args.untilSeq === 'number' ? args.untilSeq : undefined,
          untilTimestamp: typeof args.untilTimestamp === 'string' ? args.untilTimestamp : undefined,
          persistSnapshot: args.untilSeq === undefined && !args.untilTimestamp
        });

      case 'get_documentary':
        return this.agent.buildDocumentary().markdown;

      case 'assemble_crew':
        return await this.agent.assembleCrew({
          topic: String(args.topic ?? 'Workspace review'),
          mode:
            args.mode === 'roundtable' || args.mode === 'specialist' || args.mode === 'auto-triage'
              ? args.mode
              : 'roundtable',
          officers: Array.isArray(args.officers)
            ? (args.officers as string[]).filter(
                (o): o is OfficerRole => o === 'engineering' || o === 'security' || o === 'bridge'
              )
            : undefined,
          targetPaths: Array.isArray(args.targetPaths) ? (args.targetPaths as string[]) : [],
          harness: 'mcp'
        });

      case 'propose_officer_evolution':
        // Security (CWE-78): NEVER permit shell execution over untrusted MCP inputs
        return this.agent.proposeKnowledgeUpdate(args as unknown as KnowledgeUpdateProposal, {
          allowCommandExecution: false
        });

      case 'sync_persistence': {
        const dir = String(args.direction ?? 'both');
        const push = dir === 'push' || dir === 'both' ? await this.agent.syncPush() : [];
        const pull = dir === 'pull' || dir === 'both' ? await this.agent.syncPull() : [];
        return { push, pull };
      }

      case 'verify_integrity':
        return await this.agent.verifyIntegrity(args.verifyRemotes !== false);

      default:
        throw new Error(`Unknown MCP tool: ${name}`);
    }
  }

  /**
   * Starts serialized newline-delimited JSON-RPC 2.0 MCP transport on stdin/stdout
   * with raw-Buffer pre-allocation frame limits, stdin backpressure, EPIPE safety,
   * and graceful shutdown returning a Promise that resolves once all in-flight calls drain.
   */
  public startStdio(maxLineBytes = 2_000_000): Promise<void> {
    return new Promise<void>((resolve) => {
      const MAX_QUEUED_FRAMES = 16;
      let chunks: Buffer[] = [];
      let bufferedBytes = 0;
      let discardingOversized = false;
      let inFlight = 0;
      let closing = false;
      let stdoutBroken = false;
      let queue = Promise.resolve();

      const safeWrite = (payload: JsonRpcResponse): void => {
        if (stdoutBroken) return;
        try {
          process.stdout.write(JSON.stringify(payload) + '\n');
        } catch {
          stdoutBroken = true;
        }
      };

      const onStdoutError = (err: NodeJS.ErrnoException) => {
        if (err.code === 'EPIPE') {
          stdoutBroken = true;
          shutdown();
        }
      };
      process.stdout.on('error', onStdoutError);

      const enqueueLine = (lineBuf: Buffer | null, oversized: boolean): void => {
        inFlight++;
        if (inFlight >= MAX_QUEUED_FRAMES) {
          process.stdin.pause();
        }
        queue = queue
          .then(async () => {
            if (oversized || lineBuf === null) {
              safeWrite({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32600,
                  message: `Request exceeds maximum frame size (${maxLineBytes} bytes)`
                }
              });
              return;
            }
            const trimmed = lineBuf.toString('utf8').trim();
            if (!trimmed) return;
            try {
              const req = JSON.parse(trimmed) as JsonRpcRequest;
              const res = await this.handleRequest(req);
              if (res) {
                safeWrite(res);
              }
            } catch (err) {
              safeWrite({
                jsonrpc: '2.0',
                id: null,
                error: {
                  code: -32700,
                  message: `Parse error: ${redactSecrets(err instanceof Error ? err.message : String(err))}`
                }
              });
            }
          })
          .catch((err) => {
            safeWrite({
              jsonrpc: '2.0',
              id: null,
              error: {
                code: -32603,
                message: redactSecrets(err instanceof Error ? err.message : String(err))
              }
            });
          })
          .finally(() => {
            inFlight = Math.max(0, inFlight - 1);
            if (!closing && inFlight < MAX_QUEUED_FRAMES) {
              process.stdin.resume();
            }
          });
      };

      const onData = (data: Buffer | string) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
        let offset = 0;

        while (offset < buf.length) {
          const nlIdx = buf.indexOf(0x0a, offset);
          const endIdx = nlIdx === -1 ? buf.length : nlIdx;
          const segment = buf.subarray(offset, endIdx);

          if (discardingOversized) {
            if (nlIdx !== -1) {
              discardingOversized = false;
              enqueueLine(null, true);
            }
          } else if (bufferedBytes + segment.length > maxLineBytes) {
            chunks = [];
            bufferedBytes = 0;
            if (nlIdx !== -1) {
              enqueueLine(null, true);
            } else {
              discardingOversized = true;
            }
          } else {
            if (segment.length > 0) {
              chunks.push(Buffer.from(segment));
              bufferedBytes += segment.length;
            }
            if (nlIdx !== -1) {
              const lineBuf = Buffer.concat(chunks, bufferedBytes);
              chunks = [];
              bufferedBytes = 0;
              enqueueLine(lineBuf, false);
            }
          }

          offset = nlIdx === -1 ? buf.length : nlIdx + 1;
        }
      };

      const finish = () => {
        if (closing) return;
        closing = true;
        process.stdin.removeListener('data', onData);
        process.stdin.removeListener('end', onEnd);
        process.stdin.removeListener('close', finish);
        process.removeListener('SIGINT', shutdown);
        process.removeListener('SIGTERM', shutdown);
        process.stdout.removeListener('error', onStdoutError);
        queue.finally(() => resolve());
      };

      const onEnd = () => {
        if (discardingOversized) {
          discardingOversized = false;
          enqueueLine(null, true);
        } else if (bufferedBytes > 0) {
          const lineBuf = Buffer.concat(chunks, bufferedBytes);
          chunks = [];
          bufferedBytes = 0;
          enqueueLine(lineBuf, false);
        }
        finish();
      };

      const shutdown = () => {
        process.stdin.pause();
        finish();
      };

      process.stdin.on('data', onData);
      process.stdin.once('end', onEnd);
      process.stdin.once('close', finish);
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
      process.stdin.resume();
    });
  }
}
