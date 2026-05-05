import { normalizeMemberName } from './memberName';

export interface ReviewHistoryEventLike {
  id?: string;
  type: string;
  timestamp?: string;
  actor?: string;
  reviewer?: string;
}

export interface CurrentReviewOwner {
  reviewer: string;
  historyEventIds: string[];
}

function compareEventsByTimestamp(
  left: ReviewHistoryEventLike,
  right: ReviewHistoryEventLike
): number {
  const leftTime = Date.parse(left.timestamp ?? '');
  const rightTime = Date.parse(right.timestamp ?? '');
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }
  return 0;
}

export function resolveCurrentReviewOwner(input: {
  reviewState?: string | null;
  kanbanReviewer?: string | null;
  historyEvents?: ReviewHistoryEventLike[];
}): CurrentReviewOwner | null {
  if (input.reviewState !== 'review') {
    return null;
  }

  const historyEvents = [...(input.historyEvents ?? [])]
    .filter((event) =>
      [
        'review_requested',
        'review_started',
        'review_approved',
        'review_changes_requested',
      ].includes(event.type)
    )
    .sort(compareEventsByTimestamp);

  const latest = historyEvents.at(-1);
  if (latest?.type === 'review_approved' || latest?.type === 'review_changes_requested') {
    return null;
  }

  const kanbanReviewer = normalizeMemberName(input.kanbanReviewer);
  if (kanbanReviewer) {
    return {
      reviewer: kanbanReviewer,
      historyEventIds: [],
    };
  }

  const latestStarted = [...historyEvents]
    .reverse()
    .find((event) => event.type === 'review_started');
  const latestRequested = [...historyEvents]
    .reverse()
    .find((event) => event.type === 'review_requested');

  const reviewer =
    normalizeMemberName(latestStarted?.actor) || normalizeMemberName(latestRequested?.reviewer);

  if (!reviewer) {
    return null;
  }

  return {
    reviewer,
    historyEventIds: [latestStarted?.id, latestRequested?.id].filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    ),
  };
}
