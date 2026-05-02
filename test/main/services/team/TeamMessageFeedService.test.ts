import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamMessageFeedService } from '../../../../src/main/services/team/TeamMessageFeedService';

import type { InboxMessage, TeamConfig } from '../../../../src/shared/types/team';

function makeMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    from: 'user',
    to: 'jack',
    text: 'Тут?',
    timestamp: '2026-04-19T18:46:37.613Z',
    read: true,
    source: 'user_sent',
    messageId: 'user-send-1',
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('TeamMessageFeedService', () => {
  const config: TeamConfig = {
    name: 'Signal Ops 4',
    members: [{ name: 'team-lead', role: 'Lead' }],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-19T18:46:40.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reuses the cached feed within the cache TTL when no dirty invalidation arrives', async () => {
    let inboxMessages: InboxMessage[] = [makeMessage()];
    const getInboxMessages = vi.fn(async () => inboxMessages);
    const service = new TeamMessageFeedService({
      getConfig: vi.fn(async () => config),
      getInboxMessages,
      getLeadSessionMessages: vi.fn(async () => []),
      getSentMessages: vi.fn(async () => []),
    });

    const first = await service.getFeed('signal-ops-4');
    expect(first.messages).toHaveLength(1);

    inboxMessages = [
      makeMessage({
        from: 'jack',
        to: 'user',
        text: 'Да, я тут, на связи. Что нужно сделать/проверить?',
        source: 'inbox',
        timestamp: '2026-04-19T18:46:43.427Z',
      }),
      ...inboxMessages,
    ];

    vi.setSystemTime(new Date('2026-04-19T18:46:43.000Z'));

    const second = await service.getFeed('signal-ops-4');
    expect(getInboxMessages).toHaveBeenCalledTimes(1);
    expect(second.messages).toHaveLength(1);
  });

  it('refreshes the durable feed after cache expiry even when the dirty signal was missed', async () => {
    let inboxMessages: InboxMessage[] = [makeMessage()];
    const getInboxMessages = vi.fn(async () => inboxMessages);
    const service = new TeamMessageFeedService({
      getConfig: vi.fn(async () => config),
      getInboxMessages,
      getLeadSessionMessages: vi.fn(async () => []),
      getSentMessages: vi.fn(async () => []),
    });

    await service.getFeed('signal-ops-4');

    inboxMessages = [
      makeMessage({
        from: 'jack',
        to: 'user',
        text: 'Да, я тут, на связи. Что нужно сделать/проверить?',
        source: 'inbox',
        timestamp: '2026-04-19T18:46:43.427Z',
      }),
      makeMessage(),
    ];

    vi.setSystemTime(new Date('2026-04-19T18:46:46.500Z'));

    const refreshed = await service.getFeed('signal-ops-4');
    expect(getInboxMessages).toHaveBeenCalledTimes(2);
    expect(
      refreshed.messages.some(
        (message) =>
          message.from === 'jack' &&
          message.to === 'user' &&
          message.text.includes('Да, я тут')
      )
    ).toBe(true);
  });

  it('deduplicates concurrent feed rebuilds for the same team', async () => {
    const inboxRequest = createDeferred<InboxMessage[]>();
    const getInboxMessages = vi.fn(() => inboxRequest.promise);
    const service = new TeamMessageFeedService({
      getConfig: vi.fn(async () => config),
      getInboxMessages,
      getLeadSessionMessages: vi.fn(async () => []),
      getSentMessages: vi.fn(async () => []),
    });

    const first = service.getFeed('signal-ops-4');
    const second = service.getFeed('signal-ops-4');
    await Promise.resolve();

    expect(getInboxMessages).toHaveBeenCalledTimes(1);
    inboxRequest.resolve([makeMessage()]);

    const [firstFeed, secondFeed] = await Promise.all([first, second]);
    expect(firstFeed).toEqual(secondFeed);
    expect(firstFeed.messages).toHaveLength(1);
  });

  it('does not reuse or cache a stale in-flight rebuild after invalidation', async () => {
    const firstInboxRequest = createDeferred<InboxMessage[]>();
    const secondInboxRequest = createDeferred<InboxMessage[]>();
    const getInboxMessages = vi
      .fn()
      .mockImplementationOnce(() => firstInboxRequest.promise)
      .mockImplementationOnce(() => secondInboxRequest.promise);
    const service = new TeamMessageFeedService({
      getConfig: vi.fn(async () => config),
      getInboxMessages,
      getLeadSessionMessages: vi.fn(async () => []),
      getSentMessages: vi.fn(async () => []),
    });

    const staleRequest = service.getFeed('signal-ops-4');
    await Promise.resolve();
    expect(getInboxMessages).toHaveBeenCalledTimes(1);

    service.invalidate('signal-ops-4');
    const freshRequest = service.getFeed('signal-ops-4');
    await Promise.resolve();
    expect(getInboxMessages).toHaveBeenCalledTimes(2);

    secondInboxRequest.resolve([
      makeMessage({
        messageId: 'fresh-message',
        text: 'fresh',
        timestamp: '2026-04-19T18:46:45.000Z',
      }),
    ]);
    const freshFeed = await freshRequest;
    expect(freshFeed.messages[0]?.messageId).toBe('fresh-message');

    firstInboxRequest.resolve([
      makeMessage({
        messageId: 'stale-message',
        text: 'stale',
        timestamp: '2026-04-19T18:46:44.000Z',
      }),
    ]);
    await staleRequest;

    const cachedFeed = await service.getFeed('signal-ops-4');
    expect(cachedFeed.messages[0]?.messageId).toBe('fresh-message');
    expect(getInboxMessages).toHaveBeenCalledTimes(2);
  });

  it('adds UI-only OpenCode bootstrap start rows for side-lane teammates', async () => {
    const opencodeConfig: TeamConfig = {
      name: 'relay-works-14',
      description: 'relay-works-14 team for provisioning flow',
      members: [
        { name: 'team-lead', role: 'Lead', providerId: 'codex' },
        {
          name: 'bob',
          role: 'developer',
          providerId: 'opencode',
          model: 'openrouter/moonshotai/kimi-k2.6',
          joinedAt: 1777570946947,
        },
      ],
    };
    const service = new TeamMessageFeedService({
      getConfig: vi.fn(async () => opencodeConfig),
      getInboxMessages: vi.fn(async () => []),
      getLeadSessionMessages: vi.fn(async () => []),
      getSentMessages: vi.fn(async () => []),
    });

    const feed = await service.getFeed('relay-works-14');

    expect(feed.messages).toHaveLength(1);
    expect(feed.messages[0]).toMatchObject({
      from: 'team-lead',
      to: 'bob',
      source: 'system_notification',
      messageId: 'opencode-bootstrap-start:relay-works-14:bob',
      timestamp: '2026-04-30T17:42:26.947Z',
    });
    expect(feed.messages[0]?.text).toContain('Provider override for this teammate: opencode.');
    expect(feed.messages[0]?.text).toContain(
      'Model override for this teammate: openrouter/moonshotai/kimi-k2.6.'
    );
    expect(feed.messages[0]?.text).toContain(
      'The team has already been created and you are being attached as a persistent teammate.'
    );
  });
});
