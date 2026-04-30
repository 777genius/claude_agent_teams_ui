import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpAPIClient } from '@renderer/api/httpClient';

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  addEventListener = vi.fn();
  close = vi.fn();
}

describe('HttpAPIClient memberWorkSync', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let eventSourceMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    eventSourceMock = vi.fn(() => new FakeEventSource());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', eventSourceMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps browser-mode member work sync calls to the HTTP routes', async () => {
    const client = new HttpAPIClient('http://127.0.0.1:53123');
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ state: 'needs_sync' }))
      .mockResolvedValueOnce(jsonResponse({ memberCount: 1 }))
      .mockResolvedValueOnce(jsonResponse({ accepted: true }));

    await expect(
      client.memberWorkSync.getStatus({ teamName: 'demo team', memberName: 'bob/qa' })
    ).resolves.toEqual({ state: 'needs_sync' });
    await expect(client.memberWorkSync.getMetrics({ teamName: 'demo team' })).resolves.toEqual({
      memberCount: 1,
    });
    await expect(
      client.memberWorkSync.report({
        teamName: 'demo team',
        memberName: 'bob/qa',
        state: 'still_working',
        agendaFingerprint: 'agenda:v1:test',
        taskIds: ['task-a'],
        source: 'app',
      })
    ).resolves.toEqual({ accepted: true });

    expect(eventSourceMock).toHaveBeenCalledWith('http://127.0.0.1:53123/api/events');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:53123/api/teams/demo%20team/member-work-sync/bob%2Fqa',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:53123/api/teams/demo%20team/member-work-sync/metrics',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:53123/api/teams/demo%20team/member-work-sync/report',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: 'demo team',
          memberName: 'bob/qa',
          state: 'still_working',
          agendaFingerprint: 'agenda:v1:test',
          taskIds: ['task-a'],
          source: 'app',
        }),
        signal: expect.any(AbortSignal),
      })
    );
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
