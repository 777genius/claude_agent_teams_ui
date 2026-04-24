import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getTaskChanges: vi.fn(),
  updateTaskFields: vi.fn(),
  recordTaskChangePresence: vi.fn(),
  setSelectedTeamTaskChangePresence: vi.fn(),
  setTaskNeedsClarification: vi.fn(),
  getTaskAttachmentData: vi.fn(),
}));

vi.mock('@renderer/api', () => ({
  api: {
    review: {
      getTaskChanges: hoisted.getTaskChanges,
    },
  },
}));

vi.mock('@renderer/store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      updateTaskFields: hoisted.updateTaskFields,
      recordTaskChangePresence: hoisted.recordTaskChangePresence,
      setSelectedTeamTaskChangePresence: hoisted.setSelectedTeamTaskChangePresence,
      setTaskNeedsClarification: hoisted.setTaskNeedsClarification,
      getTaskAttachmentData: hoisted.getTaskAttachmentData,
    }),
}));

vi.mock('@renderer/hooks/useTheme', () => ({
  useTheme: () => ({ isLight: false }),
}));

vi.mock('@renderer/hooks/useViewportCommentRead', () => ({
  useViewportCommentRead: () => ({ registerComment: vi.fn(), flush: vi.fn() }),
}));

vi.mock('@renderer/services/commentReadStorage', () => ({
  getLegacyCutoff: () => 0,
  getReadCommentIds: () => new Set<string>(),
}));

vi.mock('@renderer/components/team/CollapsibleTeamSection', () => ({
  CollapsibleTeamSection: ({
    title,
    children,
    defaultOpen = true,
    onOpenChange,
  }: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    onOpenChange?: (isOpen: boolean) => void;
  }) => {
    const [open, setOpen] = React.useState(defaultOpen);
    React.useEffect(() => {
      onOpenChange?.(open);
    }, [open, onOpenChange]);
    return React.createElement(
      'section',
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: () => setOpen((value) => !value),
        },
        title
      ),
      title === 'Changes' && open ? React.createElement('div', null, children) : null
    );
  },
}));

vi.mock('@renderer/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('div', null, children) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
}));

vi.mock('@renderer/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  TooltipContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@renderer/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
}));

vi.mock('@renderer/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = 'button',
  }: {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }) => React.createElement('button', { type, disabled, onClick }, children),
}));

vi.mock('@renderer/components/ui/input', () => ({
  Input: (props: Record<string, unknown>) => React.createElement('input', props),
}));

vi.mock('@renderer/components/ui/MemberSelect', () => ({
  MemberSelect: () => React.createElement('div', null),
}));

vi.mock('@renderer/components/ui/ExpandableContent', () => ({
  ExpandableContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@renderer/components/ui/tiptap', () => ({
  TiptapEditor: () => React.createElement('div', null),
}));

vi.mock('@renderer/components/chat/viewers/MarkdownViewer', () => ({
  MarkdownViewer: ({ content }: { content: string }) => React.createElement('div', null, content),
}));

vi.mock('@renderer/components/team/MemberBadge', () => ({
  MemberBadge: ({ name }: { name: string }) => React.createElement('span', null, name),
}));

vi.mock('@renderer/components/team/editor/FileIcon', () => ({
  FileIcon: () => React.createElement('span', null),
}));

vi.mock('@renderer/components/common/OngoingIndicator', () => ({
  OngoingIndicator: () => React.createElement('span', null),
}));

vi.mock('@renderer/components/team/attachments/ImageLightbox', () => ({
  ImageLightbox: () => null,
  LightboxLockProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock('@renderer/components/team/attachments/SourceMessageAttachments', () => ({
  SourceMessageAttachments: () => null,
}));

vi.mock('@renderer/components/team/taskLogs/TaskLogsPanel', () => ({
  TaskLogsPanel: () => null,
}));

import { TaskDetailDialog } from '@renderer/components/team/dialogs/TaskDetailDialog';

import type { TaskChangeSetV2, TeamTaskWithKanban } from '@shared/types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeTask(id: string): TeamTaskWithKanban {
  return {
    id,
    displayId: id,
    subject: `Task ${id}`,
    description: '',
    owner: 'alice',
    reviewer: '',
    status: 'in_progress',
    changePresence: 'unknown',
    comments: [],
    attachments: [],
    blockedBy: [],
    blocks: [],
    workIntervals: [{ startedAt: '2026-04-20T10:00:00.000Z' }],
    historyEvents: [],
    createdAt: '2026-04-20T09:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
  } as unknown as TeamTaskWithKanban;
}

function makeSummary(taskId: string): TaskChangeSetV2 {
  return {
    teamName: 'team-a',
    taskId,
    files: [
      {
        filePath: `/repo/src/${taskId}.ts`,
        relativePath: `src/${taskId}.ts`,
        snippets: [],
        linesAdded: 1,
        linesRemoved: 0,
        isNewFile: true,
      },
    ],
    totalFiles: 1,
    totalLinesAdded: 1,
    totalLinesRemoved: 0,
    confidence: 'high',
    computedAt: '2026-04-20T10:05:00.000Z',
    scope: {
      taskId,
      memberName: 'alice',
      startLine: 0,
      endLine: 0,
      startTimestamp: '2026-04-20T10:00:00.000Z',
      endTimestamp: '2026-04-20T10:05:00.000Z',
      toolUseIds: ['tool-1'],
      filePaths: [`/repo/src/${taskId}.ts`],
      confidence: { tier: 1, label: 'high', reason: 'ledger' },
    },
    warnings: [],
    provenance: {
      sourceKind: 'ledger',
      sourceFingerprint: `fingerprint-${taskId}`,
    },
  };
}

function clickChangesSection(host: HTMLElement): void {
  const button = [...host.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === 'Changes'
  );
  if (!button) {
    throw new Error('Changes section button not found');
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('TaskDetailDialog changes summary loading', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not drop a new task changes request while another task summary is still in flight', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const first = deferred<TaskChangeSetV2>();
    const second = deferred<TaskChangeSetV2>();
    hoisted.getTaskChanges
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const taskA = makeTask('task-a');
    const taskB = makeTask('task-b');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const baseProps = {
      open: true,
      variant: 'team' as const,
      teamName: 'team-a',
      taskMap: new Map<string, TeamTaskWithKanban>(),
      members: [],
      onClose: vi.fn(),
      onViewChanges: vi.fn(),
    };

    await act(async () => {
      root.render(React.createElement(TaskDetailDialog, { ...baseProps, task: taskA }));
      await Promise.resolve();
    });
    await act(async () => {
      clickChangesSection(host);
      await Promise.resolve();
    });
    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(1);
    expect(hoisted.getTaskChanges).toHaveBeenLastCalledWith(
      'team-a',
      'task-a',
      expect.objectContaining({ summaryOnly: true })
    );

    await act(async () => {
      root.render(React.createElement(TaskDetailDialog, { ...baseProps, task: taskB }));
      await Promise.resolve();
    });
    await act(async () => {
      clickChangesSection(host);
      await Promise.resolve();
    });

    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(2);
    expect(hoisted.getTaskChanges).toHaveBeenLastCalledWith(
      'team-a',
      'task-b',
      expect.objectContaining({ summaryOnly: true })
    );

    await act(async () => {
      root.render(React.createElement(TaskDetailDialog, { ...baseProps, task: taskA }));
      await Promise.resolve();
    });
    await act(async () => {
      clickChangesSection(host);
      await Promise.resolve();
    });
    expect(hoisted.getTaskChanges).toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve(makeSummary('task-a'));
      await Promise.resolve();
    });
    expect(host.textContent).toContain('src/task-a.ts');
    expect(host.textContent).not.toContain('src/task-b.ts');

    await act(async () => {
      second.resolve(makeSummary('task-b'));
      await Promise.resolve();
    });
    expect(host.textContent).toContain('src/task-a.ts');
    expect(host.textContent).not.toContain('src/task-b.ts');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
