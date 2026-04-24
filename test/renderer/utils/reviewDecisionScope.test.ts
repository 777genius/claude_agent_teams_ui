import { describe, expect, it } from 'vitest';

import {
  buildReviewDecisionScopeToken,
  fingerprintReviewChangeSet,
} from '../../../src/renderer/utils/reviewDecisionScope';

describe('buildReviewDecisionScopeToken', () => {
  it('includes task request signature so filtered task variants do not collide', () => {
    const baseChangeSet = {
      teamName: 'demo',
      taskId: 'task-1',
      files: [],
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      totalFiles: 0,
      confidence: 'high' as const,
      computedAt: '2026-04-21T10:00:00.000Z',
      scope: {
        taskId: 'task-1',
        memberName: 'alice',
        startLine: 0,
        endLine: 0,
        startTimestamp: '',
        endTimestamp: '',
        toolUseIds: [],
        filePaths: [],
        confidence: { tier: 1 as const, label: 'high' as const, reason: 'ok' },
      },
      warnings: [],
      provenance: {
        sourceKind: 'ledger' as const,
        sourceFingerprint: 'fp-1',
      },
    };

    const tokenA = buildReviewDecisionScopeToken({
      mode: 'task',
      taskId: 'task-1',
      requestSignature: '{"status":"in_progress"}',
      changeSet: baseChangeSet,
    });
    const tokenB = buildReviewDecisionScopeToken({
      mode: 'task',
      taskId: 'task-1',
      requestSignature: '{"status":"completed"}',
      changeSet: baseChangeSet,
    });

    expect(tokenA).not.toBe(tokenB);
  });

  it('keeps fallback content identity stable for relative Windows slash and case variants', () => {
    const baseFile = {
      relativePath: 'SRC\\File.ts',
      linesAdded: 1,
      linesRemoved: 1,
      isNewFile: false,
      snippets: [
        {
          toolUseId: 'tool-1',
          filePath: 'SRC\\File.ts',
          toolName: 'Edit' as const,
          type: 'edit' as const,
          oldString: 'before',
          newString: 'after',
          replaceAll: false,
          timestamp: '2026-04-21T10:00:00.000Z',
          isError: false,
        },
      ],
    };
    const left = {
      teamName: 'team-a',
      taskId: 'task-1',
      files: [{ ...baseFile, filePath: 'SRC\\File.ts' }],
      totalFiles: 1,
      totalLinesAdded: 1,
      totalLinesRemoved: 1,
      confidence: 'fallback' as const,
      computedAt: '2026-04-21T10:00:00.000Z',
      scope: {
        taskId: 'task-1',
        memberName: 'alice',
        startLine: 0,
        endLine: 0,
        startTimestamp: '',
        endTimestamp: '',
        toolUseIds: [],
        filePaths: ['SRC\\File.ts'],
        confidence: { tier: 4 as const, label: 'fallback' as const, reason: 'test' },
      },
      warnings: [],
    };
    const right = {
      ...left,
      files: [
        {
          ...baseFile,
          filePath: 'src/file.ts',
          relativePath: 'src/file.ts',
          snippets: [{ ...baseFile.snippets[0], filePath: 'src/file.ts' }],
        },
      ],
    };

    expect(fingerprintReviewChangeSet(left)).toBe(fingerprintReviewChangeSet(right));
  });
});
