import { StreamEvent, WorkspaceProjection } from './types.js';

export interface DocumentaryChapter {
  chapterNumber: number;
  sessionId: string;
  startedAt: string;
  endedAt: string;
  harnesses: string[];
  eventCount: number;
  highlights: string[];
  events: StreamEvent[];
}

export interface WorkspaceDocumentary {
  workspaceRoot: string;
  generatedAt: string;
  totalEvents: number;
  chapters: DocumentaryChapter[];
  markdown: string;
}

/**
 * Transforms the raw event-sourced stream into a human-readable chronological
 * "Documentary of the Workspace" spanning chats, harnesses, crashes, pivots,
 * lessons learned, crew roundtables, and officer KPI evolution.
 */
export function buildWorkspaceDocumentary(
  events: StreamEvent[],
  state: WorkspaceProjection
): WorkspaceDocumentary {
  const chapters: DocumentaryChapter[] = [];
  let current: DocumentaryChapter | null = null;

  for (const ev of events) {
    const startNewChapter =
      !current ||
      current.sessionId !== ev.sessionId ||
      ev.type === 'workspace.attached' ||
      ev.type === 'harness.switched';

    if (startNewChapter) {
      current = {
        chapterNumber: chapters.length + 1,
        sessionId: ev.sessionId,
        startedAt: ev.timestamp,
        endedAt: ev.timestamp,
        harnesses: [ev.harness],
        eventCount: 0,
        highlights: [],
        events: []
      };
      chapters.push(current);
    }

    current!.endedAt = ev.timestamp;
    current!.eventCount += 1;
    if (!current!.harnesses.includes(ev.harness)) {
      current!.harnesses.push(ev.harness);
    }
    current!.events.push(ev);

    if (
      ev.type === 'lesson.captured' ||
      ev.type === 'decision.recorded' ||
      ev.type === 'directive.issued' ||
      ev.type === 'exec.crashed' ||
      ev.type === 'exec.failed' ||
      ev.type === 'crew.consensus' ||
      ev.type === 'officer.knowledge.updated' ||
      ev.type === 'git.commit'
    ) {
      current!.highlights.push(`[#${ev.seq} ${ev.type}] ${ev.summary}`);
    }
  }

  const lines: string[] = [
    `# Workspace Documentary — ${state.workspaceRoot}`,
    '',
    `> Curated by **Number One** (Event-Sourced System of Record)`,
    '',
    `## Overview`,
    `- **Total Atomic Events**: ${events.length}`,
    `- **Harnesses Spanned**: ${state.harnessesSeen.join(', ') || 'none'}`,
    `- **Sessions Spanned**: ${state.sessionsSeen.length}`,
    `- **Lessons Captured**: ${Object.keys(state.lessons).length}`,
    `- **Decisions Recorded**: ${Object.keys(state.decisions).length}`,
    `- **Authoritative Directives**: ${Object.values(state.directives).filter((d) => d.active).length} active / ${Object.keys(state.directives).length} total`,
    `- **Crashes Recorded**: ${state.crashes.length} (${state.crashes.filter((c) => c.resolvedByEventId).length} resolved)`,
    `- **Party Mode Sessions**: ${Object.keys(state.partySessions).length}`,
    ''
  ];

  if (Object.keys(state.lessons).length > 0) {
    lines.push(`## Institutional Lessons Learned`);
    for (const lesson of Object.values(state.lessons)) {
      lines.push(`### ${lesson.title}`);
      lines.push(`- **Problem**: ${lesson.problem}`);
      lines.push(`- **Root Cause**: ${lesson.rootCause}`);
      if (lesson.failedApproaches.length > 0) {
        lines.push(`- **Dead Ends Avoided**: ${lesson.failedApproaches.join(' | ')}`);
      }
      lines.push(`- **Resolution**: ${lesson.resolution}`);
      lines.push(`- **Prevention Rule**: ${lesson.preventionRule}`);
      lines.push('');
    }
  }

  lines.push(`## Chronological Chapters`);
  for (const ch of chapters) {
    lines.push(
      `### Chapter ${ch.chapterNumber}: Session \`${ch.sessionId}\` (${ch.harnesses.join(', ')})`
    );
    lines.push(`*${ch.startedAt} -> ${ch.endedAt} (${ch.eventCount} events)*`);
    lines.push('');
    for (const ev of ch.events) {
      const paths = ev.affectedPaths.length > 0 ? ` [${ev.affectedPaths.join(', ')}]` : '';
      lines.push(`- **#${ev.seq}** \`${ev.type}\` (${ev.actor.kind}:${ev.actor.id} via ${ev.harness}): ${ev.summary}${paths}`);
    }
    lines.push('');
  }

  return {
    workspaceRoot: state.workspaceRoot,
    generatedAt: new Date().toISOString(),
    totalEvents: events.length,
    chapters,
    markdown: lines.join('\n')
  };
}
