import { execFileSync } from 'node:child_process';
import { RemoteRecordRef, StreamEvent } from '../core/types.js';
import {
  readResponseJsonBounded,
  readResponseTextBounded,
  resilientFetch,
  resolveScopedEnvVar
} from '../utils/http.js';
import { redactSecrets } from '../utils/redactor.js';
import {
  PersistenceAdapter,
  PulledExternalEvent,
  PushEventContext,
  PushEventOutcome
} from './types.js';

export interface GitHubAdapterConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  projectNumber?: number;
  apiBaseUrl?: string;
  token?: string;
  tokenEnvVar?: string;
  useGhCli?: boolean;
  allowPrivateHosts?: boolean;
}

export const GITHUB_LABELS: Array<{ name: string; color: string; description: string }> = [
  { name: 'n1:stream', color: '0052cc', description: 'Managed by Number One Event Stream' },
  { name: 'n1:lesson', color: '0e8a16', description: 'Institutional memory / Lesson learned' },
  { name: 'n1:decision', color: '5319e7', description: 'Architectural or process decision (ADR)' },
  { name: 'n1:directive', color: 'b60205', description: 'Authoritative Number One directive' },
  { name: 'n1:crash', color: 'd93f0b', description: 'Recorded crash or execution failure' },
  { name: 'n1:issue', color: '1d76db', description: 'Tracked project issue' },
  { name: 'n1:party-mode', color: 'fbca04', description: 'Bridge Crew audit session' },
  { name: 'n1:evolution', color: '006b75', description: 'Empirically verified officer knowledge update' },
  { name: 'n1:officer:engineering', color: 'c5def5', description: 'Engineering Officer (Infra & Runtime)' },
  { name: 'n1:officer:security', color: 'f9d0c4', description: 'Security Officer (AppSec/InfraSec/Quality)' },
  { name: 'n1:officer:bridge', color: 'bfdadc', description: 'Bridge Officer (Release & Continuous Delivery)' }
];

const EMBEDDED_MARKER_PREFIX = 'numberone:event';
const SAFE_GH_SEGMENT_RX = /^[A-Za-z0-9._-]{1,100}$/;

export interface GitHubEmbeddedMeta {
  schemaVersion: 1;
  eventId: string;
  seq: number;
  type: string;
  hash: string;
  prevHash: string;
  harness: string;
  sessionId: string;
  fallbackBlobs: Array<{ key: string; uri: string; sha256: string }>;
  fallbackFields: string[];
}

/**
 * Pure deterministic builder for GitHub Issue/Comment markdown body with embedded integrity block.
 * Neutralizes `-->` and `--!>` in payload previews and redacts metadata BEFORE JSON serialization.
 */
export function buildGitHubIssueBody(event: StreamEvent, fallbackFields: string[]): string {
  const meta: GitHubEmbeddedMeta = {
    schemaVersion: 1,
    eventId: event.id,
    seq: event.seq,
    type: event.type,
    hash: event.hash,
    prevHash: event.prevHash,
    harness: redactSecrets(event.harness),
    sessionId: redactSecrets(event.sessionId),
    fallbackBlobs: event.blobs.map((b) => ({ key: redactSecrets(b.key), uri: b.uri, sha256: b.sha256 })),
    fallbackFields: fallbackFields.map((f) => redactSecrets(f))
  };

  const payloadPreview = redactSecrets(JSON.stringify(event.payload, null, 2).slice(0, 6000))
    .replaceAll('-->', '--\\>')
    .replaceAll('--!>', '--!\\>');

  const lines: string[] = [
    `## Number One Stream Event \`#${event.seq}\` (\`${event.type}\`)`,
    '',
    `- **Event ID**: \`${event.id}\``,
    `- **Timestamp**: ${event.timestamp}`,
    `- **Actor**: \`${event.actor.kind}:${redactSecrets(event.actor.id)}\``,
    `- **Harness / Session**: \`${meta.harness}\` / \`${meta.sessionId}\``,
    `- **Integrity Hash**: \`${event.hash}\``,
    ''
  ];

  if (event.affectedPaths.length > 0) {
    lines.push(`### Affected Paths`, ...event.affectedPaths.map((p) => `- \`${p}\``), '');
  }

  lines.push('### Details', '```json', payloadPreview, '```', '');

  if (event.blobs.length > 0 || fallbackFields.length > 0) {
    lines.push('### `.numberone` Fallback Integrity Pointers');
    for (const blob of event.blobs) {
      lines.push(`- **${redactSecrets(blob.key)}**: \`${blob.uri}\` (${blob.sizeBytes} bytes, ${blob.contentType})`);
    }
    if (fallbackFields.length > 0) {
      lines.push(`- **Local Fallback Fields**: ${meta.fallbackFields.join(', ')}`);
    }
    lines.push('');
  }

  const narrative = redactSecrets(lines.join('\n'));
  return `${narrative}\n<!-- numberone:event ${JSON.stringify(meta)} -->`;
}

/**
 * Extracts the LAST embedded integrity marker in linear O(n) time
 * (immune to ReDoS and spoofed markers inside payload previews).
 */
export function parseGitHubEmbeddedMeta(body: string): GitHubEmbeddedMeta | null {
  let lastJson: string | null = null;
  let cursor = 0;
  let end = -1;

  while (cursor < body.length) {
    const start = body.indexOf('<!--', cursor);
    if (start === -1) break;
    if (end < start + 4) {
      end = body.indexOf('-->', start + 4);
      if (end === -1) break;
    }

    const nextOpen = body.indexOf('<!--', start + 4);
    if (nextOpen !== -1 && nextOpen < end) {
      cursor = nextOpen;
      continue;
    }

    const inner = body.slice(start + 4, end).trim();
    if (inner.startsWith(EMBEDDED_MARKER_PREFIX)) {
      const rest = inner.slice(EMBEDDED_MARKER_PREFIX.length);
      if (rest.length > 0 && /\s/.test(rest[0]!)) {
        const candidate = rest.trim();
        if (candidate.startsWith('{') && candidate.endsWith('}')) {
          lastJson = candidate;
        }
      }
    }
    cursor = end + 3;
  }

  if (!lastJson) return null;
  try {
    return JSON.parse(lastJson) as GitHubEmbeddedMeta;
  } catch {
    return null;
  }
}

export function labelsForGitHubEvent(event: StreamEvent): string[] {
  const labels = new Set<string>(['n1:stream']);
  if (event.type.startsWith('lesson.')) labels.add('n1:lesson');
  if (event.type === 'decision.recorded') labels.add('n1:decision');
  if (event.type.startsWith('directive.')) labels.add('n1:directive');
  if (event.type === 'exec.crashed' || event.type === 'exec.failed') labels.add('n1:crash');
  if (event.type.startsWith('issue.')) labels.add('n1:issue');
  if (event.type.startsWith('crew.')) labels.add('n1:party-mode');
  if (event.type.startsWith('officer.')) labels.add('n1:evolution');

  const officer = event.payload.ownerOfficer ?? event.payload.officer ?? event.payload.issuedBy;
  if (officer === 'engineering' || officer === 'security' || officer === 'bridge') {
    labels.add(`n1:officer:${officer}`);
  }
  return Array.from(labels);
}

/**
 * Builds GraphQL queries covering Repository, Organization, and User scopes for GitHub Projects v2.
 */
export function buildGitHubProjectV2LookupQueries(owner: string, repo: string, number: number) {
  return [
    {
      scope: 'repository' as const,
      query: `query($owner: String!, $repo: String!, $number: Int!) { repository(owner: $owner, name: $repo) { projectV2(number: $number) { id } } }`,
      variables: { owner, repo, number }
    },
    {
      scope: 'organization' as const,
      query: `query($owner: String!, $number: Int!) { organization(login: $owner) { projectV2(number: $number) { id } } }`,
      variables: { owner, number }
    },
    {
      scope: 'user' as const,
      query: `query($owner: String!, $number: Int!) { user(login: $owner) { projectV2(number: $number) { id } } }`,
      variables: { owner, number }
    }
  ];
}

/**
 * GitHub Issues + Labels + Milestones + Comments + Projects v2 persistence adapter.
 */
export class GitHubPersistenceAdapter implements PersistenceAdapter {
  public readonly backend = 'github' as const;
  public readonly name: string;
  private readonly config: GitHubAdapterConfig;
  private readonly apiBaseUrl: string;
  private readonly repoBasePath: string;
  private taxonomyReady = false;
  private availableLabels = new Set<string>();
  private milestoneCache = new Map<string, number>();

  constructor(config: GitHubAdapterConfig) {
    this.config = config;
    this.apiBaseUrl = (config.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.name = `github:${config.owner}/${config.repo}`;
    if (
      config.enabled &&
      (!SAFE_GH_SEGMENT_RX.test(config.owner) || !SAFE_GH_SEGMENT_RX.test(config.repo))
    ) {
      throw new Error(`Invalid GitHub owner/repo: "${config.owner}/${config.repo}"`);
    }
    this.repoBasePath = `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  }

  public isConfigured(): boolean {
    return Boolean(this.config.enabled && this.config.owner && this.config.repo && this.resolveToken());
  }

  private isOfficialGitHubApi(): boolean {
    try {
      const host = new URL(this.apiBaseUrl).hostname.toLowerCase();
      return host === 'api.github.com' || host.endsWith('.github.com');
    } catch {
      return false;
    }
  }

  private resolveToken(): string | null {
    if (this.config.token) return this.config.token;
    const fromEnv = resolveScopedEnvVar(
      this.config.tokenEnvVar,
      ['GITHUB_', 'GH_'],
      ['GITHUB_TOKEN', 'GH_TOKEN']
    );
    if (fromEnv) return fromEnv;
    // Never forward `gh auth token` to arbitrary non-GitHub hosts (SEC-03)
    if (this.config.useGhCli !== false && this.isOfficialGitHubApi()) {
      try {
        const out = execFileSync('gh', ['auth', 'token'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        if (out) return out;
      } catch {
        // gh CLI not logged in
      }
    }
    return null;
  }

  private async request<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const token = this.resolveToken();
    if (!token) {
      throw new Error(`GitHub token unavailable for ${this.name}`);
    }
    const res = await resilientFetch(`${this.apiBaseUrl}${apiPath}`, {
      method,
      allowPrivateHosts: this.config.allowPrivateHosts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'numberone-agent/1.0'
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const txt = await readResponseTextBounded(res, 100_000).catch(() => '');
      throw new Error(`GitHub API ${method} ${apiPath} failed (${res.status}): ${redactSecrets(txt).slice(0, 300)}`);
    }
    if (res.status === 204) return undefined as T;
    return await readResponseJsonBounded<T>(res, 5_000_000);
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const data = await this.request<{ data?: T; errors?: Array<{ message: string }> }>(
      'POST',
      '/graphql',
      { query, variables }
    );
    if (data.errors && data.errors.length > 0) {
      throw new Error(`GitHub GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`);
    }
    return data.data as T;
  }

  public async ensureTaxonomy(): Promise<void> {
    if (this.taxonomyReady) return;
    let discoveredOk = false;
    try {
      for (let page = 1; page <= 5; page++) {
        const existing = await this.request<Array<{ name: string }>>(
          'GET',
          `${this.repoBasePath}/labels?per_page=100&page=${page}`
        );
        discoveredOk = true;
        for (const l of existing) {
          this.availableLabels.add(l.name);
        }
        if (existing.length < 100) break;
      }
    } catch {
      // Do not cache taxonomyReady on transient discovery failure
      return;
    }

    for (const label of GITHUB_LABELS) {
      if (!this.availableLabels.has(label.name)) {
        try {
          const created = await this.request<{ name: string }>('POST', `${this.repoBasePath}/labels`, label);
          if (created?.name) this.availableLabels.add(created.name);
        } catch (err) {
          if (err instanceof Error && err.message.includes('(422)')) {
            this.availableLabels.add(label.name);
          }
        }
      }
    }
    if (discoveredOk) this.taxonomyReady = true;
  }

  private async ensureMilestone(title: string): Promise<number | undefined> {
    if (this.milestoneCache.has(title)) return this.milestoneCache.get(title);
    try {
      for (let page = 1; page <= 5; page++) {
        const milestones = await this.request<Array<{ number: number; title: string }>>(
          'GET',
          `${this.repoBasePath}/milestones?state=all&per_page=100&page=${page}`
        );
        for (const m of milestones) {
          this.milestoneCache.set(m.title, m.number);
        }
        if (this.milestoneCache.has(title)) return this.milestoneCache.get(title);
        if (milestones.length < 100) break;
      }
      const created = await this.request<{ number: number }>('POST', `${this.repoBasePath}/milestones`, {
        title,
        description: `Number One milestone: ${title}`
      });
      this.milestoneCache.set(title, created.number);
      return created.number;
    } catch {
      return undefined;
    }
  }

  private async attachToProjectV2(issueNodeId: string): Promise<void> {
    if (!this.config.projectNumber || !issueNodeId) return;
    const lookups = buildGitHubProjectV2LookupQueries(
      this.config.owner,
      this.config.repo,
      this.config.projectNumber
    );
    let projectId: string | undefined;

    for (const lookup of lookups) {
      try {
        const data = await this.graphql<{
          repository?: { projectV2?: { id: string } };
          organization?: { projectV2?: { id: string } };
          user?: { projectV2?: { id: string } };
        }>(lookup.query, lookup.variables);
        projectId =
          data?.repository?.projectV2?.id ??
          data?.organization?.projectV2?.id ??
          data?.user?.projectV2?.id;
        if (projectId) break;
      } catch {
        // Continue to next owner scope
      }
    }

    if (!projectId) return;
    try {
      await this.graphql(
        `mutation($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
            item { id }
          }
        }`,
        { projectId, contentId: issueNodeId }
      );
    } catch {
      // Optional enrichment if token lacks `project` scope
    }
  }

  private resolveParentEntityKey(event: StreamEvent): string | null {
    const p = event.payload;
    if (typeof p.issueId === 'string') return `issue:${p.issueId}`;
    if (typeof p.partySessionId === 'string') return `party:${p.partySessionId}`;
    if (typeof p.lessonId === 'string') return `lesson:${p.lessonId}`;
    if (typeof p.directiveId === 'string') return `directive:${p.directiveId}`;
    if (event.correlationId) return `corr:${event.correlationId}`;
    return null;
  }

  public async pushEvent(event: StreamEvent, context: PushEventContext): Promise<PushEventOutcome> {
    await this.ensureTaxonomy();

    if (
      event.type === 'workspace.snapshot' ||
      event.type === 'fs.created' ||
      event.type === 'fs.modified' ||
      event.type === 'fs.deleted' ||
      event.type === 'fs.renamed' ||
      event.type === 'exec.started' ||
      event.type === 'sync.pushed' ||
      event.type === 'sync.pulled' ||
      event.type === 'sync.reconciled'
    ) {
      return {
        synced: false,
        fallbackFields: ['fullEvent', 'rawDiffs', 'blobs'],
        skippedReason: `Routed to .numberone fallback ledger (high-frequency local event ${event.type})`
      };
    }

    const fallbackFields: string[] = [];
    if (event.blobs.length > 0) fallbackFields.push('blobs');

    const entityKey = this.resolveParentEntityKey(event);
    const existingEntityRef = entityKey ? context.ledger.entities[entityKey]?.[this.backend] : undefined;

    if (
      existingEntityRef &&
      (event.type === 'issue.updated' ||
        event.type === 'issue.resolved' ||
        event.type === 'issue.reopened' ||
        event.type === 'crew.opinion' ||
        event.type === 'crew.challenge' ||
        event.type === 'crew.consensus' ||
        event.type === 'crew.veto' ||
        event.type === 'lesson.verified' ||
        event.type === 'lesson.applied' ||
        event.type === 'lesson.superseded' ||
        event.type === 'directive.superseded' ||
        event.type === 'chat.thinking')
    ) {
      const rawNum = (existingEntityRef.externalKey ?? existingEntityRef.externalId).replace(/^#/, '').split('#')[0]!;
      const issueNumber = encodeURIComponent(rawNum);
      const comment = await this.request<{ id: number; html_url: string }>(
        'POST',
        `${this.repoBasePath}/issues/${issueNumber}/comments`,
        {
          body: buildGitHubIssueBody(event, fallbackFields)
        }
      );

      // Best-effort state transition after comment creation so comment ref is never lost on PATCH error
      try {
        if (event.type === 'issue.resolved' || event.type === 'directive.superseded') {
          await this.request('PATCH', `${this.repoBasePath}/issues/${issueNumber}`, { state: 'closed' });
        } else if (event.type === 'issue.reopened') {
          await this.request('PATCH', `${this.repoBasePath}/issues/${issueNumber}`, { state: 'open' });
        }
      } catch {
        // Comment already persisted; preserve ref
      }

      const ref: RemoteRecordRef = {
        backend: 'github',
        externalId: String(comment.id),
        externalKey: `${rawNum}#comment-${comment.id}`,
        entityType: 'issue_comment',
        url: comment.html_url,
        syncedAt: new Date().toISOString(),
        syncedHash: event.hash,
        fallbackFields
      };

      return { synced: true, ref, fallbackFields };
    }

    const milestoneName =
      typeof event.payload.milestone === 'string'
        ? event.payload.milestone
        : event.type.startsWith('crew.')
          ? 'Number One Bridge Crew'
          : event.type.startsWith('lesson.')
            ? 'Institutional Memory'
            : undefined;
    const milestoneNumber = milestoneName ? await this.ensureMilestone(milestoneName) : undefined;

    const desiredLabels = labelsForGitHubEvent(event).filter((l) => this.availableLabels.has(l));
    const title = `[N1 #${event.seq}] ${event.summary}`.slice(0, 240);

    const payload: Record<string, unknown> = {
      title,
      body: buildGitHubIssueBody(event, fallbackFields)
    };
    if (desiredLabels.length > 0) payload.labels = desiredLabels;
    if (milestoneNumber !== undefined) payload.milestone = milestoneNumber;

    const created = await this.request<{
      id: number;
      node_id?: string;
      number: number;
      html_url: string;
    }>('POST', `${this.repoBasePath}/issues`, payload);

    if (created.node_id && this.config.projectNumber) {
      await this.attachToProjectV2(created.node_id);
    }

    const ref: RemoteRecordRef = {
      backend: 'github',
      externalId: String(created.id),
      externalKey: String(created.number),
      entityType: 'issue',
      url: created.html_url,
      syncedAt: new Date().toISOString(),
      syncedHash: event.hash,
      fallbackFields
    };

    return {
      synced: true,
      ref,
      entityKey: entityKey ?? `event:${event.id}`,
      fallbackFields
    };
  }

  public async pullExternalEvents(sinceTimestamp?: string, maxPages = 10): Promise<PulledExternalEvent[]> {
    const sinceParam = sinceTimestamp ? `&since=${encodeURIComponent(sinceTimestamp)}` : '';
    const direction = sinceTimestamp ? 'asc' : 'desc';
    const pulled: PulledExternalEvent[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const issues = await this.request<
        Array<{
          id: number;
          number: number;
          title: string;
          body: string | null;
          state: string;
          created_at: string;
          updated_at: string;
          user?: { login: string };
          labels?: Array<{ name: string }>;
          pull_request?: unknown;
        }>
      >(
        'GET',
        `${this.repoBasePath}/issues?state=all&sort=updated&direction=${direction}&per_page=100&page=${page}${sinceParam}`
      );

      for (const issue of issues) {
        if (issue.pull_request) continue;
        const body = issue.body ?? '';
        const meta = parseGitHubEmbeddedMeta(body);

        pulled.push({
          externalId: String(issue.id),
          externalKey: String(issue.number),
          backend: 'github',
          type: issue.state === 'closed' ? 'issue.resolved' : 'issue.opened',
          summary: issue.title,
          actorName: issue.user?.login ?? 'github-user',
          timestamp: issue.updated_at || issue.created_at,
          tags: (issue.labels ?? []).map((l) => l.name),
          payload: {
            issueId: `gh-${issue.number}`,
            githubNumber: issue.number,
            title: issue.title,
            description: body,
            state: issue.state
          },
          embeddedEventId: meta?.eventId
        });
      }

      if (issues.length < 100) break;
    }

    return pulled;
  }

  public async verifyRemoteRef(
    event: StreamEvent,
    ref: RemoteRecordRef
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const rawKey = (ref.externalKey ?? ref.externalId).replace(/^#/, '').split('#')[0]!;
      if (ref.entityType === 'issue') {
        const issue = await this.request<{ id: number; body: string | null }>(
          'GET',
          `${this.repoBasePath}/issues/${encodeURIComponent(rawKey)}`
        );
        const meta = parseGitHubEmbeddedMeta(issue.body ?? '');
        if (!meta || meta.hash !== event.hash) {
          return {
            ok: false,
            reason: `GitHub issue #${rawKey} integrity hash mismatch (expected ${event.hash})`
          };
        }
        return { ok: true };
      }
      if (ref.entityType === 'issue_comment') {
        const comment = await this.request<{ id: number; body: string | null }>(
          'GET',
          `${this.repoBasePath}/issues/comments/${encodeURIComponent(ref.externalId)}`
        );
        const meta = parseGitHubEmbeddedMeta(comment.body ?? '');
        if (!meta || meta.hash !== event.hash) {
          return {
            ok: false,
            reason: `GitHub comment ${ref.externalId} integrity hash mismatch (expected ${event.hash})`
          };
        }
        return { ok: true };
      }
      if (ref.entityType === 'external_issue') {
        await this.request<{ id: number }>('GET', `${this.repoBasePath}/issues/${encodeURIComponent(rawKey)}`);
        return { ok: true };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
