import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MemberWorkSyncBadge,
  MemberWorkSyncDetails,
  useMemberWorkSyncStatus,
} from '@features/member-work-sync/renderer';

import type { MemberWorkSyncStatus } from '@features/member-work-sync/contracts';

const apiMocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
}));

vi.mock('@renderer/api', () => ({
  api: {
    memberWorkSync: {
      getStatus: apiMocks.getStatus,
    },
  },
  isElectronMode: () => true,
}));

function makeStatus(overrides: Partial<MemberWorkSyncStatus> = {}): MemberWorkSyncStatus {
  return {
    teamName: 'team-a',
    memberName: 'bob',
    state: 'needs_sync',
    agenda: {
      teamName: 'team-a',
      memberName: 'bob',
      generatedAt: '2026-04-29T00:00:00.000Z',
      fingerprint: 'agenda:v1:abcdef1234567890',
      items: [
        {
          taskId: 'task-1',
          displayId: '11111111',
          subject: 'Ship UI',
          kind: 'work',
          assignee: 'bob',
          priority: 'normal',
          reason: 'owned_pending_task',
          evidence: { status: 'pending', owner: 'bob' },
        },
      ],
      diagnostics: [],
    },
    shadow: {
      reconciledBy: 'queue',
      wouldNudge: true,
      fingerprintChanged: false,
    },
    evaluatedAt: '2026-04-29T00:00:00.000Z',
    diagnostics: ['developer_only'],
    ...overrides,
  };
}

describe('member work sync renderer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('loads read-only status through the renderer hook', async () => {
    apiMocks.getStatus.mockResolvedValue(makeStatus());
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    function Harness(): React.ReactElement {
      const state = useMemberWorkSyncStatus({ teamName: 'team-a', memberName: 'bob' });
      return React.createElement('div', null, state.loading ? 'Loading' : state.viewModel.label);
    }

    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    expect(apiMocks.getStatus).toHaveBeenCalledWith({ teamName: 'team-a', memberName: 'bob' });
    expect(host.textContent).toContain('Needs sync');
  });

  it('renders neutral diagnostics without exposing raw diagnostics by default', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        React.createElement(
          'div',
          null,
          React.createElement(MemberWorkSyncBadge, { status: makeStatus() }),
          React.createElement(MemberWorkSyncDetails, { status: makeStatus() })
        )
      );
    });

    expect(host.textContent).toContain('Needs sync');
    expect(host.textContent).toContain('Shadow would nudge');
    expect(host.textContent).toContain('11111111');
    expect(host.textContent).not.toContain('developer_only');
  });
});
