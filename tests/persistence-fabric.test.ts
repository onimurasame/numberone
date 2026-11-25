import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberOneAgent } from '../src/harness/number-one.js';
import {
  DirectoryPersistenceAdapter,
  DirectoryScrumIssue
} from '../src/persistence/directory-adapter.js';
import {
  buildGitHubIssueBody,
  buildGitHubProjectV2LookupQueries,
  labelsForGitHubEvent,
  parseGitHubEmbeddedMeta
} from '../src/persistence/github-adapter.js';
import {
  buildJiraCreateFields,
  buildJiraSearchPayload,
  mapJiraIssueType,
  mapJiraPriority
} from '../src/persistence/jira-adapter.js';

const tmpDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe('PersistenceFabric (Mock-Free Real Directory Scrum Store + Protocol Contract Tests)', () => {
  it('syncs primary events, comments, transitions, active sprints, causal links, and .numberone fallback pointers to a real external DirectoryPersistenceAdapter', async () => {
    const ws = createTempDir('n1-persist-ws-');
    const externalScrumDir = createTempDir('n1-scrum-store-');

    // Pre-create a human-authored Scrum issue file directly in the external Scrum directory
    fs.mkdirSync(path.join(externalScrumDir, 'issues'), { recursive: true });
    const humanIssue: DirectoryScrumIssue = {
      id: 'OPS-1',
      key: 'OPS-1',
      issueType: 'Bug',
      status: 'open',
      priority: 'high',
      component: 'Engineering Officer',
      sprint: 'OPS-Sprint-1',
      summary: 'External operator filed connection pool exhaustion bug',
      description: 'Investigate idle client timeout',
      labels: ['production'],
      reporter: 'human:sre-lead',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
      links: [],
      comments: []
    };
    fs.writeFileSync(
      path.join(externalScrumDir, 'issues', 'OPS-1.json'),
      JSON.stringify(humanIssue, null, 2)
    );

    const dirAdapter = new DirectoryPersistenceAdapter({
      enabled: true,
      targetDir: externalScrumDir,
      projectKey: 'OPS'
    });

    const agent = new NumberOneAgent(ws, [dirAdapter]);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    // 1. High-frequency local FS edit with fallback diff blob -> stays in .numberone fallback
    agent.recordEvent({
      type: 'fs.modified',
      actor: { kind: 'watcher', id: 'fs-watcher' },
      harness: 'watcher',
      summary: 'Modified src/server.ts',
      affectedPaths: ['src/server.ts'],
      fallbackBlobs: [{ key: 'diff', content: '--- a/src/server.ts\n+++ b/src/server.ts\n+drain();\n' }]
    });

    // 2. Open Scrum bug + resolve it
    const openEv = agent.openIssue({
      title: 'Graceful shutdown drops active requests on SIGTERM',
      description: 'Add connection drain before exit',
      kind: 'bug',
      priority: 'critical',
      ownerOfficer: 'engineering',
      affectedPaths: ['src/server.ts']
    });
    const issueId = String(openEv.payload.issueId);
    agent.resolveIssue(issueId, 'Implemented server.close() drain handler');

    // 3. Capture lesson causally linked to openEv + attach raw log blob in .numberone fallback
    agent.recordEvent({
      type: 'lesson.captured',
      actor: { kind: 'numberone', id: 'numberone' },
      causationId: openEv.id,
      summary: 'Lesson: Drain HTTP server before process exit',
      affectedPaths: ['src/server.ts'],
      tags: ['lesson', 'sigterm'],
      payload: {
        lessonId: 'les-sigterm',
        title: 'Drain HTTP server before process exit',
        problem: '502 errors during deploy',
        rootCause: 'Immediate process.exit(0)',
        resolution: 'Await server.close()',
        preventionRule: 'Always drain listeners on SIGTERM'
      },
      fallbackBlobs: [{ key: 'rawTrace', content: '502 Bad Gateway trace log...' }]
    });

    const pushReports = await agent.syncPush();
    expect(pushReports).toHaveLength(1);
    expect(pushReports[0]!.failedCount).toBe(0);
    expect(pushReports[0]!.pushedCount).toBeGreaterThanOrEqual(4);
    expect(pushReports[0]!.fallbackOnlyCount).toBeGreaterThanOrEqual(2); // workspace.snapshot + fs.modified? Wait: snapshot is primary, fs.modified is fallback

    // Inspect real Scrum files written on disk
    const issueFiles = fs.readdirSync(path.join(externalScrumDir, 'issues')).sort();
    expect(issueFiles.length).toBeGreaterThanOrEqual(4);

    const parsedIssues = issueFiles.map(
      (f) =>
        JSON.parse(
          fs.readFileSync(path.join(externalScrumDir, 'issues', f), 'utf8')
        ) as DirectoryScrumIssue
    );

    const sigtermIssue = parsedIssues.find((i) => i.summary.includes('SIGTERM'))!;
    expect(sigtermIssue).toBeDefined();
    expect(sigtermIssue.issueType).toBe('Bug');
    expect(sigtermIssue.priority).toBe('critical');
    expect(sigtermIssue.status).toBe('done'); // Transitioned by resolveIssue!
    expect(sigtermIssue.comments).toHaveLength(1);
    expect(sigtermIssue.sprint).toBe('OPS-Sprint-1');

    const lessonIssue = parsedIssues.find((i) => i.summary.includes('Drain HTTP server'))!;
    expect(lessonIssue.links).toEqual([{ type: 'Relates', targetKey: sigtermIssue.key }]);
    expect(lessonIssue.numberoneEvent?.fallbackBlobs).toHaveLength(1);
    expect(lessonIssue.numberoneEvent?.fallbackBlobs[0]!.uri).toMatch(/^n1:\/\/fallback\//);

    // Verify distributed integrity passes across local .numberone + external directory
    const intact = await agent.verifyIntegrity(true);
    expect(intact.valid).toBe(true);
    expect(intact.verifiedBlobs).toBeGreaterThanOrEqual(2);
    expect(intact.remoteChecks[0]!.driftErrors).toEqual([]);

    // Pull external human issue without duplicating Number One's synced issues
    const pullReports = await agent.syncPull();
    expect(pullReports[0]!.ingestedCount).toBe(1);
    expect(pullReports[0]!.skippedDuplicates).toBeGreaterThanOrEqual(3);

    const state = agent.getState();
    expect(
      Object.values(state.issues).some((i) => i.title.includes('connection pool exhaustion'))
    ).toBe(true);

    // Tamper with external Scrum file hash on disk -> verifyIntegrity detects remote drift!
    sigtermIssue.numberoneEvent!.hash = '0'.repeat(64);
    fs.writeFileSync(
      path.join(externalScrumDir, 'issues', `${sigtermIssue.key}.json`),
      JSON.stringify(sigtermIssue, null, 2)
    );
    const drifted = await agent.verifyIntegrity(true);
    expect(drifted.valid).toBe(false);
    expect(drifted.remoteChecks[0]!.driftErrors.length).toBe(1);
  });

  it('validates GitHub REST/GraphQL and Jira REST v3/ADF wire contracts without mock servers', () => {
    const ws = createTempDir('n1-contract-ws-');
    const agent = new NumberOneAgent(ws);
    agent.attach({ installHooks: false, installShims: false, backfillGitCommits: 0 });

    const ev = agent.recordEvent({
      type: 'issue.opened',
      actor: { kind: 'human', id: 'dev' },
      summary: 'Database failover test failure',
      affectedPaths: ['src/db.ts'],
      tags: ['db', 'failover'],
      payload: {
        issueId: 'iss-db',
        kind: 'story',
        priority: 'critical',
        ownerOfficer: 'security'
      },
      fallbackBlobs: [{ key: 'dump', content: 'raw failover log' }]
    });

    // 1. GitHub Issue body + embedded metadata round-trip + labels + multi-scope Projects v2 GraphQL
    const ghBody = buildGitHubIssueBody(ev, ['blobs']);
    expect(ghBody).toContain('n1://fallback/');
    const parsedMeta = parseGitHubEmbeddedMeta(ghBody);
    expect(parsedMeta?.eventId).toBe(ev.id);
    expect(parsedMeta?.hash).toBe(ev.hash);
    expect(parsedMeta?.fallbackBlobs).toHaveLength(1);

    const labels = labelsForGitHubEvent(ev);
    expect(labels).toContain('n1:issue');
    expect(labels).toContain('n1:officer:security');

    const v2Queries = buildGitHubProjectV2LookupQueries('acme-org', 'core-api', 7);
    expect(v2Queries.map((q) => q.scope)).toEqual(['repository', 'organization', 'user']);

    // 2. Jira REST v3 field builder safely adapts when components/priorities/issueTypes are restricted
    const restrictedFields = buildJiraCreateFields({
      projectKey: 'SEC',
      event: ev,
      narrative: 'Event narrative',
      availableIssueTypes: new Set(['Task']), // Project lacks 'Story' -> falls back to 'Task'
      availableComponents: new Set(), // Non-admin couldn't create components -> omitted!
      availablePriorities: new Set() // Screen lacks priority -> omitted!
    });
    expect(restrictedFields.issuetype).toEqual({ name: 'Task' });
    expect(restrictedFields.components).toBeUndefined();
    expect(restrictedFields.priority).toBeUndefined();

    const fullFields = buildJiraCreateFields({
      projectKey: 'SEC',
      event: ev,
      narrative: 'Event narrative',
      availableIssueTypes: new Set(['Epic', 'Story', 'Bug', 'Task']),
      availableComponents: new Set(['Security Officer']),
      availablePriorities: new Set(['High', 'Medium', 'Low']) // No 'Highest' -> falls back to 'High'
    });
    expect(fullFields.issuetype).toEqual({ name: 'Story' });
    expect(fullFields.components).toEqual([{ name: 'Security Officer' }]);
    expect(fullFields.priority).toEqual({ name: 'High' });
    expect(mapJiraIssueType(ev, new Set(['Story']))).toBe('Story');
    expect(mapJiraPriority(ev, new Set(['Highest']))).toBe('Highest');

    // 3. Jira Cloud /rest/api/3/search/jql cursor pagination payload
    const searchPage2 = buildJiraSearchPayload('SEC', '2026-11-21T09:30:00Z', 'cursor-tok-2');
    expect(searchPage2.jql).toBe('project = "SEC" AND updated >= "2026-11-21 09:30" ORDER BY updated ASC');
    expect(searchPage2.nextPageToken).toBe('cursor-tok-2');
  });
});
