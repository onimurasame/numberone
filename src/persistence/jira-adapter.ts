import { RemoteRecordRef, StreamEvent } from '../core/types.js';
import {
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

export interface JiraAdapterConfig {
  enabled: boolean;
  baseUrl: string;
  projectKey: string;
  boardId?: number;
  email?: string;
  apiToken?: string;
  emailEnvVar?: string;
  apiTokenEnvVar?: string;
  allowPrivateHosts?: boolean;
}

export const JIRA_OFFICER_COMPONENTS: Record<string, string> = {
  engineering: 'Engineering Officer',
  security: 'Security Officer',
  bridge: 'Bridge Officer',
  numberone: 'Number One SoR'
};

const SAFE_JIRA_PROJECT_KEY_RX = /^[A-Z][A-Z0-9_]{0,31}$/i;
const SAFE_JIRA_ISSUE_KEY_RX = /^[A-Z][A-Z0-9_]{0,31}-\d+$/i;

export function toAdfDocument(text: string): Record<string, unknown> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: block.slice(0, 10_000) }]
    }));
  return {
    type: 'doc',
    version: 1,
    content:
      paragraphs.length > 0
        ? paragraphs
        : [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }]
  };
}

export function mapJiraIssueType(
  event: StreamEvent,
  availableTypes?: Set<string>
): string {
  const kind = event.payload.kind;
  let preferred = 'Task';
  if (kind === 'epic') preferred = 'Epic';
  else if (kind === 'story') preferred = 'Story';
  else if (
    kind === 'bug' ||
    kind === 'crash' ||
    event.type === 'exec.crashed' ||
    event.type === 'exec.failed'
  ) {
    preferred = 'Bug';
  }

  if (!availableTypes || availableTypes.size === 0 || availableTypes.has(preferred)) {
    return preferred;
  }
  if (availableTypes.has('Task')) return 'Task';
  return Array.from(availableTypes)[0]!;
}

export function mapJiraPriority(
  event: StreamEvent,
  availablePriorities?: Set<string>
): string | null {
  const sev = event.payload.priority ?? event.payload.severity;
  let preferred = 'Medium';
  if (sev === 'critical' || sev === 'blocking') preferred = 'Highest';
  else if (sev === 'high' || sev === 'mandatory') preferred = 'High';
  else if (sev === 'low' || sev === 'advisory') preferred = 'Low';

  if (!availablePriorities || availablePriorities.size === 0) return null;
  if (availablePriorities.has(preferred)) return preferred;
  if (preferred === 'Highest' && availablePriorities.has('High')) return 'High';
  if (availablePriorities.has('Medium')) return 'Medium';
  return null;
}

export function buildJiraCreateFields(options: {
  projectKey: string;
  event: StreamEvent;
  narrative: string;
  availableIssueTypes?: Set<string>;
  availableComponents?: Set<string>;
  availablePriorities?: Set<string>;
}): Record<string, unknown> {
  const { projectKey, event, narrative } = options;
  const officer = String(
    event.payload.ownerOfficer ?? event.payload.officer ?? event.payload.issuedBy ?? 'numberone'
  );
  const componentName = JIRA_OFFICER_COMPONENTS[officer] ?? JIRA_OFFICER_COMPONENTS.numberone!;
  const labels = Array.from(
    new Set([
      'numberone',
      `n1-${event.type.replace(/\./g, '-')}`,
      ...event.tags.map((t) => t.replace(/[^a-zA-Z0-9_-]/g, '-'))
    ])
  );

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    issuetype: { name: mapJiraIssueType(event, options.availableIssueTypes) },
    summary: `[N1 #${event.seq}] ${event.summary}`.slice(0, 240),
    description: toAdfDocument(narrative),
    labels
  };

  if (options.availableComponents?.has(componentName)) {
    fields.components = [{ name: componentName }];
  }

  const priority = mapJiraPriority(event, options.availablePriorities);
  if (priority) {
    fields.priority = { name: priority };
  }

  return fields;
}

export function buildJiraSearchPayload(
  projectKey: string,
  sinceTimestamp?: string,
  nextPageToken?: string
): Record<string, unknown> {
  if (!SAFE_JIRA_PROJECT_KEY_RX.test(projectKey)) {
    throw new Error(`Invalid Jira projectKey for JQL query: "${projectKey}"`);
  }
  const jqlParts = [`project = "${projectKey}"`];
  if (sinceTimestamp) {
    const parsedMs = Date.parse(sinceTimestamp);
    if (!Number.isFinite(parsedMs)) {
      throw new Error(`Invalid ISO-8601 sinceTimestamp for Jira JQL query: "${sinceTimestamp}"`);
    }
    const isoUtc = new Date(parsedMs).toISOString();
    const formatted = isoUtc.slice(0, 16).replace('T', ' ');
    jqlParts.push(`updated >= "${formatted}"`);
  }
  // When no cursor is provided, order DESC so large (>1000 issue) projects never starve new issues
  const order = sinceTimestamp ? 'ASC' : 'DESC';
  const payload: Record<string, unknown> = {
    jql: `${jqlParts.join(' AND ')} ORDER BY updated ${order}`,
    maxResults: 100,
    fields: ['summary', 'status', 'labels', 'updated', 'created', 'reporter'],
    properties: ['numberone.event']
  };
  if (nextPageToken) {
    payload.nextPageToken = nextPageToken;
  }
  return payload;
}

/**
 * Jira Scrum Persistence Adapter (REST API v3 + Agile API 1.0).
 */
export class JiraPersistenceAdapter implements PersistenceAdapter {
  public readonly backend = 'jira' as const;
  public readonly name: string;
  private readonly config: JiraAdapterConfig;
  private readonly baseUrl: string;
  private taxonomyReady = false;
  private availableComponents = new Set<string>();
  private availableIssueTypes = new Set<string>();
  private availablePriorities = new Set<string>();

  constructor(config: JiraAdapterConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    if (config.enabled && !SAFE_JIRA_PROJECT_KEY_RX.test(config.projectKey)) {
      throw new Error(`Invalid Jira projectKey: "${config.projectKey}"`);
    }
    this.name = `jira:${config.projectKey}`;
  }

  public isConfigured(): boolean {
    const creds = this.resolveAuthHeader();
    return Boolean(this.config.enabled && this.baseUrl && this.config.projectKey && creds);
  }

  private resolveAuthHeader(): string | null {
    const email =
      this.config.email ??
      resolveScopedEnvVar(this.config.emailEnvVar, ['JIRA_'], ['JIRA_EMAIL']);
    const token =
      this.config.apiToken ??
      resolveScopedEnvVar(this.config.apiTokenEnvVar, ['JIRA_'], ['JIRA_API_TOKEN']);
    if (!email || !token) return null;
    return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  }

  private async request<T>(method: string, apiPath: string, body?: unknown): Promise<T> {
    const auth = this.resolveAuthHeader();
    if (!auth) throw new Error(`Jira credentials unavailable for ${this.name}`);
    const res = await resilientFetch(`${this.baseUrl}${apiPath}`, {
      method,
      allowPrivateHosts: this.config.allowPrivateHosts,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const txt = await readResponseTextBounded(res, 100_000).catch(() => '');
      throw new Error(`Jira API ${method} ${apiPath} failed (${res.status}): ${redactSecrets(txt).slice(0, 300)}`);
    }
    if (res.status === 204) return undefined as T;
    const text = await readResponseTextBounded(res, 5_000_000);
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  public async ensureTaxonomy(): Promise<void> {
    if (this.taxonomyReady) return;

    try {
      const proj = await this.request<{
        issueTypes?: Array<{ name: string; subtask?: boolean }>;
      }>('GET', `/rest/api/3/project/${encodeURIComponent(this.config.projectKey)}`);
      for (const it of proj.issueTypes ?? []) {
        if (!it.subtask && it.name) this.availableIssueTypes.add(it.name);
      }
    } catch {
      return;
    }

    try {
      const priorities = await this.request<Array<{ name: string }>>('GET', '/rest/api/3/priority');
      for (const p of priorities ?? []) {
        if (p.name) this.availablePriorities.add(p.name);
      }
    } catch {
      // Optional if restricted
    }

    try {
      const components = await this.request<Array<{ name: string }>>(
        'GET',
        `/rest/api/3/project/${encodeURIComponent(this.config.projectKey)}/components`
      );
      for (const c of components) {
        this.availableComponents.add(c.name);
      }
      for (const compName of Object.values(JIRA_OFFICER_COMPONENTS)) {
        if (!this.availableComponents.has(compName)) {
          const created = await this.request<{ name: string }>('POST', '/rest/api/3/component', {
            name: compName,
            project: this.config.projectKey,
            description: `Number One managed component: ${compName}`
          }).catch(() => null);
          if (created?.name) {
            this.availableComponents.add(created.name);
          }
        }
      }
    } catch {
      // Non-admin user: omit component refs
    }

    this.taxonomyReady = true;
  }

  private async getActiveSprintId(): Promise<number | null> {
    if (!this.config.boardId) return null;
    try {
      const res = await this.request<{ values: Array<{ id: number; state: string }> }>(
        'GET',
        `/rest/agile/1.0/board/${encodeURIComponent(String(this.config.boardId))}/sprint?state=active`
      );
      return res.values[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  private async transitionIssue(issueKey: string, targetNameKeywords: string[]): Promise<void> {
    try {
      const res = await this.request<{
        transitions: Array<{ id: string; name: string }>;
      }>('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`);
      const match = res.transitions.find((t) =>
        targetNameKeywords.some((kw) => t.name.toLowerCase().includes(kw.toLowerCase()))
      );
      if (match) {
        await this.request('POST', `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
          transition: { id: match.id }
        });
      }
    } catch {
      // Best-effort workflow transition
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

  private buildNarrative(event: StreamEvent, fallbackFields: string[]): string {
    const lines = [
      `Number One Event #${event.seq} [${event.type}]`,
      `Event ID: ${event.id}`,
      `Actor: ${event.actor.kind}:${event.actor.id} | Harness: ${event.harness} | Session: ${event.sessionId}`,
      `Integrity Hash: ${event.hash}`,
      '',
      `Summary: ${event.summary}`,
      ''
    ];
    if (event.affectedPaths.length > 0) {
      lines.push(`Affected Paths: ${event.affectedPaths.join(', ')}`, '');
    }
    lines.push(`Payload: ${JSON.stringify(event.payload, null, 2).slice(0, 4000)}`, '');
    if (event.blobs.length > 0 || fallbackFields.length > 0) {
      lines.push(
        `Fallback Store Pointers (.numberone): ${event.blobs.map((b) => `${b.key}=${b.uri}`).join(', ') || 'none'}`,
        `Fallback Fields: ${fallbackFields.join(', ') || 'none'}`
      );
    }
    return redactSecrets(lines.join('\n'));
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
      existingEntityRef.externalKey &&
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
      const issueKey = existingEntityRef.externalKey.split('#')[0]!;
      const comment = await this.request<{ id: string }>(
        'POST',
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
        {
          body: toAdfDocument(this.buildNarrative(event, fallbackFields))
        }
      );

      if (
        event.type === 'issue.resolved' ||
        event.type === 'directive.superseded' ||
        event.type === 'lesson.superseded'
      ) {
        await this.transitionIssue(issueKey, ['done', 'resolve', 'close']);
      } else if (event.type === 'issue.reopened') {
        await this.transitionIssue(issueKey, ['reopen', 'to do', 'open']);
      } else if (event.type === 'issue.updated' && event.payload.status === 'in_progress') {
        await this.transitionIssue(issueKey, ['in progress', 'start']);
      }

      const ref: RemoteRecordRef = {
        backend: 'jira',
        externalId: comment.id,
        externalKey: `${issueKey}#comment-${comment.id}`,
        entityType: 'comment',
        url: `${this.baseUrl}/browse/${issueKey}`,
        syncedAt: new Date().toISOString(),
        syncedHash: event.hash,
        fallbackFields
      };

      return { synced: true, ref, fallbackFields };
    }

    const fields = buildJiraCreateFields({
      projectKey: this.config.projectKey,
      event,
      narrative: this.buildNarrative(event, fallbackFields),
      availableIssueTypes: this.availableIssueTypes,
      availableComponents: this.availableComponents,
      availablePriorities: this.availablePriorities
    });

    const created = await this.request<{ id: string; key: string }>('POST', '/rest/api/3/issue', {
      fields
    });

    // Best-effort secondary metadata attachments so created issue ref is never lost on secondary failure
    await this.request(
      'PUT',
      `/rest/api/3/issue/${encodeURIComponent(created.key)}/properties/numberone.event`,
      {
        schemaVersion: 1,
        eventId: event.id,
        seq: event.seq,
        type: event.type,
        hash: event.hash,
        prevHash: event.prevHash,
        harness: event.harness,
        sessionId: event.sessionId,
        fallbackBlobs: event.blobs,
        fallbackFields
      }
    ).catch(() => {});

    const activeSprintId = await this.getActiveSprintId();
    if (activeSprintId) {
      await this.request('POST', `/rest/agile/1.0/sprint/${activeSprintId}/issue`, {
        issues: [created.key]
      }).catch(() => {});
    }

    if (event.causationId) {
      const parentRef = context.ledger.events[event.causationId]?.remotes.jira;
      if (parentRef?.externalKey && !parentRef.externalKey.includes('#comment-')) {
        await this.request('POST', '/rest/api/3/issueLink', {
          type: { name: event.type === 'lesson.captured' ? 'Relates' : 'Causes' },
          inwardIssue: { key: parentRef.externalKey },
          outwardIssue: { key: created.key }
        }).catch(() => {});
      }
    }

    const ref: RemoteRecordRef = {
      backend: 'jira',
      externalId: created.id,
      externalKey: created.key,
      entityType: 'issue',
      url: `${this.baseUrl}/browse/${created.key}`,
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
    const pulled: PulledExternalEvent[] = [];
    let nextPageToken: string | undefined;

    for (let page = 1; page <= maxPages; page++) {
      const searchPayload = buildJiraSearchPayload(
        this.config.projectKey,
        sinceTimestamp,
        nextPageToken
      );

      const res = await this.request<{
        issues: Array<{
          id: string;
          key: string;
          properties?: Record<string, { eventId?: string }>;
          fields: {
            summary: string;
            status?: { name: string };
            labels?: string[];
            updated?: string;
            created?: string;
            reporter?: { displayName?: string };
          };
        }>;
        nextPageToken?: string;
        isLast?: boolean;
      }>('POST', '/rest/api/3/search/jql', searchPayload);

      for (const issue of res.issues ?? []) {
        // Use inline property from search/jql response to avoid N+1 HTTP storms
        let embeddedEventId: string | undefined = issue.properties?.['numberone.event']?.eventId;
        if (!embeddedEventId && (issue.fields.labels ?? []).includes('numberone')) {
          try {
            const prop = await this.request<{ value?: { eventId?: string } }>(
              'GET',
              `/rest/api/3/issue/${encodeURIComponent(issue.key)}/properties/numberone.event`
            );
            embeddedEventId = prop.value?.eventId;
          } catch {
            // Externally created issue
          }
        }

        const statusName = issue.fields.status?.name?.toLowerCase() ?? 'open';
        pulled.push({
          externalId: issue.id,
          externalKey: issue.key,
          backend: 'jira',
          type:
            statusName.includes('done') || statusName.includes('closed')
              ? 'issue.resolved'
              : 'issue.opened',
          summary: issue.fields.summary,
          actorName: issue.fields.reporter?.displayName ?? 'jira-user',
          timestamp: issue.fields.updated ?? issue.fields.created ?? new Date().toISOString(),
          tags: issue.fields.labels ?? [],
          payload: {
            issueId: `jira-${issue.key}`,
            jiraKey: issue.key,
            title: issue.fields.summary,
            status: statusName
          },
          embeddedEventId
        });
      }

      if (!res.nextPageToken || res.isLast) break;
      nextPageToken = res.nextPageToken;
    }

    return pulled;
  }

  public async verifyRemoteRef(
    event: StreamEvent,
    ref: RemoteRecordRef
  ): Promise<{ ok: boolean; reason?: string }> {
    try {
      const issueKey = (ref.externalKey ?? ref.externalId).split('#')[0]!;
      if (!SAFE_JIRA_ISSUE_KEY_RX.test(issueKey)) {
        return { ok: false, reason: `Invalid Jira issue key "${issueKey}"` };
      }

      if (ref.entityType === 'issue') {
        const prop = await this.request<{ value?: { hash?: string; eventId?: string } }>(
          'GET',
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}/properties/numberone.event`
        );
        if (prop.value?.hash !== event.hash) {
          return {
            ok: false,
            reason: `Jira ${issueKey} property hash mismatch (expected ${event.hash}, got ${prop.value?.hash ?? 'none'})`
          };
        }
        return { ok: true };
      }

      if (ref.entityType === 'comment') {
        const comment = await this.request<{ id: string; body?: unknown }>(
          'GET',
          `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment/${encodeURIComponent(ref.externalId)}`
        );
        const serialized = JSON.stringify(comment.body ?? '');
        if (!serialized.includes(event.hash)) {
          return {
            ok: false,
            reason: `Jira comment ${issueKey}#${ref.externalId} integrity hash mismatch`
          };
        }
        return { ok: true };
      }

      if (ref.entityType === 'external_issue') {
        await this.request<{ id: string }>('GET', `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary`);
        return { ok: true };
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
