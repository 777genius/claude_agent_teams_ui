import { stripAgentBlocks } from '@shared/constants/agentBlocks';

import type { BoardTaskActivityRecord } from '../taskLogs/activity/BoardTaskActivityRecord';
import type { TaskComment, TeamTask } from '@shared/types';

export type TaskProgressSignal =
  | 'strong_progress'
  | 'weak_start_only'
  | 'blocker_or_clarification'
  | 'terminal_progress'
  | 'unknown';

export interface TaskProgressTouchClassification {
  signal: TaskProgressSignal;
  reason: string;
}

const CONCRETE_FILE_OR_PATH_RE =
  /(?:^|\s)(?:\.{1,2}\/|~\/|\/|\w[\w.-]*\/)[\w./\s-]+|\b[\w.-]+\.(?:[cm]?[tj]sx?|json|md|css|scss|py|go|rs|java|kt|swift|ya?ml|toml|lock|sh|sql)\b/i;
const TASK_OR_ISSUE_REF_RE = /#[a-f0-9]{6,}|\btask-[\w-]+/i;
const TEST_OR_BUILD_RESULT_RE =
  /\b(?:test(?:s|ed|ing)?|vitest|jest|playwright|pnpm|npm|bun|build|typecheck|lint|passed|failed|green|red|error|exception|stack trace)\b|тест|сборк|линт|ошибк|упал|прош[её]л/i;
const SUBSTANTIVE_WORK_RE =
  /\b(?:implemented|fixed|added|updated|changed|removed|found|verified|confirmed|completed|created|refactored|patched|root cause|next step)\b|исправ|добав|обнов|измен|удал|наш[её]л|подтверд|готово|сделал|сделана|причин|следующ/i;
const BLOCKER_OR_CLARIFICATION_RE =
  /\?|(?:^|\b)(?:blocked|blocker|cannot|can't|need|needs|waiting|clarification|question|permission|access denied|not enough context)\b|не могу|не получается|нужн|жду|блок|уточн|вопрос|нет доступа|недостаточно контекст/i;
const WEAK_START_ONLY_RE =
  /^(?:я\s+)?(?:начинаю(?:\s+работу)?|начну|приступаю(?:\s+к\s+работе)?|беру\s+в\s+работу|проверю|сейчас\s+проверю|посмотрю|разберусь|готов(?:а)?\s+приступить|готов(?:а)?\s+к\s+работе|will\s+start|starting\s+work|starting|taking\s+this|i(?:'|’)?ll\s+start|i\s+will\s+start|i\s+am\s+starting|i(?:'|’)?ll\s+check|i\s+will\s+check|checking\s+now|on\s+it)(?:[.!…\s]*)$/i;

function normalizeCommentText(text: string): string {
  return stripAgentBlocks(text).replace(/\s+/g, ' ').trim();
}

function isConcreteProgress(text: string): boolean {
  return (
    CONCRETE_FILE_OR_PATH_RE.test(text) ||
    TASK_OR_ISSUE_REF_RE.test(text) ||
    TEST_OR_BUILD_RESULT_RE.test(text) ||
    SUBSTANTIVE_WORK_RE.test(text)
  );
}

function classifyTaskCommentText(text: string): TaskProgressTouchClassification {
  const normalized = normalizeCommentText(text);
  if (!normalized) {
    return { signal: 'unknown', reason: 'comment_text_empty' };
  }

  if (BLOCKER_OR_CLARIFICATION_RE.test(normalized)) {
    return {
      signal: 'blocker_or_clarification',
      reason: 'comment_mentions_blocker_or_clarification',
    };
  }

  if (isConcreteProgress(normalized)) {
    return { signal: 'strong_progress', reason: 'comment_contains_concrete_progress' };
  }

  if (normalized.length <= 120 && WEAK_START_ONLY_RE.test(normalized)) {
    return { signal: 'weak_start_only', reason: 'comment_is_start_only' };
  }

  return { signal: 'unknown', reason: 'comment_progress_signal_unclear' };
}

export function getTaskCommentForActivityRecord(
  task: TeamTask,
  record: BoardTaskActivityRecord
): TaskComment | null {
  const commentId = record.action?.details?.commentId?.trim();
  if (!commentId) {
    return null;
  }
  return task.comments?.find((comment) => comment.id === commentId) ?? null;
}

export function classifyTaskProgressTouch(args: {
  task: TeamTask;
  record: BoardTaskActivityRecord;
}): TaskProgressTouchClassification {
  const toolName = args.record.action?.canonicalToolName;
  if (toolName === 'task_start' || toolName === 'task_set_status') {
    return { signal: 'strong_progress', reason: `${toolName}_is_authoritative_touch` };
  }
  if (toolName === 'task_complete') {
    return { signal: 'terminal_progress', reason: 'task_complete_is_terminal' };
  }
  if (toolName === 'task_set_clarification') {
    return {
      signal: 'blocker_or_clarification',
      reason: 'task_set_clarification_is_blocker_signal',
    };
  }
  if (toolName !== 'task_add_comment') {
    return { signal: 'unknown', reason: 'tool_is_not_classified_for_task_progress' };
  }

  const comment = getTaskCommentForActivityRecord(args.task, args.record);
  if (!comment) {
    return { signal: 'unknown', reason: 'task_comment_text_unavailable' };
  }

  return classifyTaskCommentText(comment.text);
}
