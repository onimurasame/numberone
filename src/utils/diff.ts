export interface LineDiffResult {
  added: number;
  removed: number;
  unified: string;
  truncated: boolean;
}

/**
 * Computes a concise unified-style line diff between previous and next text.
 * Bounded for large files to keep stream events compact while preserving fidelity.
 */
export function computeUnifiedDiff(
  filePath: string,
  before: string,
  after: string,
  maxLines = 160
): LineDiffResult {
  const a = before === '' ? [] : before.split(/\r?\n/);
  const b = after === '' ? [] : after.split(/\r?\n/);

  // Fast trim of common prefix & suffix
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA + 1);
  const midB = b.slice(start, endB + 1);

  const lines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
  let added = 0;
  let removed = 0;

  if (midA.length === 0 && midB.length === 0) {
    return { added: 0, removed: 0, unified: '', truncated: false };
  }

  const ctxStart = Math.max(0, start - 2);
  const ctxEndA = Math.min(a.length, endA + 3);
  lines.push(`@@ -${ctxStart + 1},${ctxEndA - ctxStart} +${ctxStart + 1},${ctxEndA - ctxStart - midA.length + midB.length} @@`);

  for (let i = ctxStart; i < start; i++) {
    lines.push(` ${a[i]!}`);
  }

  // Use LCS for reasonably sized changed regions, fallback to block replacement for huge edits
  if (midA.length * midB.length <= 250_000) {
    const m = midA.length;
    const n = midB.length;
    const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      const row = dp[i]!;
      const nextRow = dp[i + 1]!;
      for (let j = n - 1; j >= 0; j--) {
        if (midA[i] === midB[j]) {
          row[j] = nextRow[j + 1]! + 1;
        } else {
          row[j] = Math.max(nextRow[j]!, row[j + 1]!);
        }
      }
    }
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) {
        lines.push(` ${midA[i]!}`);
        i++;
        j++;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        lines.push(`-${midA[i]!}`);
        removed++;
        i++;
      } else {
        lines.push(`+${midB[j]!}`);
        added++;
        j++;
      }
    }
    while (i < m) {
      lines.push(`-${midA[i]!}`);
      removed++;
      i++;
    }
    while (j < n) {
      lines.push(`+${midB[j]!}`);
      added++;
      j++;
    }
  } else {
    for (const l of midA) {
      lines.push(`-${l}`);
      removed++;
    }
    for (const l of midB) {
      lines.push(`+${l}`);
      added++;
    }
  }

  for (let i = endA + 1; i < ctxEndA; i++) {
    lines.push(` ${a[i]!}`);
  }

  const truncated = lines.length > maxLines;
  const outputLines = truncated
    ? [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more diff lines truncated; full content stored in fallback blob)`]
    : lines;

  return {
    added,
    removed,
    unified: outputLines.join('\n'),
    truncated
  };
}
