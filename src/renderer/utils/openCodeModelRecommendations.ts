export type OpenCodeTeamModelRecommendationLevel = 'recommended' | 'not-recommended';

export interface OpenCodeTeamModelRecommendation {
  readonly level: OpenCodeTeamModelRecommendationLevel;
  readonly label: string;
  readonly reason: string;
}

const PASSED_REAL_AGENT_TEAMS_E2E_REASON =
  'This exact model route passed real OpenCode Agent Teams E2E: launch, direct reply, and teammate-to-teammate relay.';

const OPENCODE_TEAM_RECOMMENDED_MODELS = new Set<string>([
  'opencode/minimax-m2.5-free',
  'openrouter/anthropic/claude-haiku-4.5',
  'openrouter/anthropic/claude-sonnet-4.5',
  'openrouter/deepseek/deepseek-v3.2',
  'openrouter/google/gemini-2.5-flash',
  'openrouter/google/gemini-2.5-flash-lite',
  'openrouter/google/gemini-3-flash-preview',
  'openrouter/minimax/minimax-m2.5',
  'openrouter/mistralai/codestral-2508',
  'openrouter/openai/gpt-5.4-mini',
  'openrouter/openai/gpt-oss-120b:free',
  'openrouter/qwen/qwen3-coder',
  'openrouter/qwen/qwen3-coder-flash',
]);

const OPENCODE_TEAM_NOT_RECOMMENDED_MODELS = new Map<string, string>([
  [
    'opencode/ling-2.6-flash-free',
    'Real OpenCode Agent Teams E2E showed unreliable peer relay for this model.',
  ],
  [
    'opencode/nemotron-3-super-free',
    'Real OpenCode Agent Teams E2E showed empty assistant turns during peer relay.',
  ],
  [
    'openrouter/google/gemini-2.5-pro',
    'Real OpenCode Agent Teams E2E passed direct reply but failed peer relay.',
  ],
  [
    'openrouter/google/gemini-3-pro-preview',
    'OpenRouter reported no runnable endpoints for this model during execution verification.',
  ],
  [
    'openrouter/meta-llama/llama-3.3-70b-instruct:free',
    'Execution verification timed out before Agent Teams launch could proceed.',
  ],
  [
    'openrouter/minimax/minimax-m2.5:free',
    'This OpenRouter free route for MiniMax M2.5 passed direct reply but failed teammate-to-teammate relay. The non-free OpenRouter route and the OpenCode free alias are tracked separately.',
  ],
  [
    'openrouter/openai/gpt-oss-20b:free',
    'Execution verification passed, but real Agent Teams E2E produced fake tool text instead of MCP message_send.',
  ],
  [
    'openrouter/openrouter/free',
    'Aggregator routing was unstable in real Agent Teams E2E and timed out during peer relay.',
  ],
  [
    'openrouter/z-ai/glm-4.5-air:free',
    'Real OpenCode Agent Teams E2E was slow and failed peer relay with empty assistant turns.',
  ],
]);

function normalizeOpenCodeTeamModelId(modelId: string | null | undefined): string {
  return modelId?.trim().toLowerCase() ?? '';
}

export function getOpenCodeTeamModelRecommendation(
  modelId: string | null | undefined
): OpenCodeTeamModelRecommendation | null {
  const normalizedModelId = normalizeOpenCodeTeamModelId(modelId);
  if (!normalizedModelId) {
    return null;
  }

  if (OPENCODE_TEAM_RECOMMENDED_MODELS.has(normalizedModelId)) {
    return {
      level: 'recommended',
      label: 'Recommended',
      reason: PASSED_REAL_AGENT_TEAMS_E2E_REASON,
    };
  }

  const notRecommendedReason = OPENCODE_TEAM_NOT_RECOMMENDED_MODELS.get(normalizedModelId);
  if (notRecommendedReason) {
    return {
      level: 'not-recommended',
      label: 'Not recommended',
      reason: notRecommendedReason,
    };
  }

  return null;
}

export function isOpenCodeTeamModelRecommended(modelId: string | null | undefined): boolean {
  return getOpenCodeTeamModelRecommendation(modelId)?.level === 'recommended';
}

export function getOpenCodeTeamModelRecommendationSortRank(
  modelId: string | null | undefined
): number {
  const recommendation = getOpenCodeTeamModelRecommendation(modelId);
  if (recommendation?.level === 'recommended') {
    return 0;
  }
  if (recommendation?.level === 'not-recommended') {
    return 2;
  }
  return 1;
}

export function compareOpenCodeTeamModelRecommendations(
  leftModelId: string | null | undefined,
  rightModelId: string | null | undefined
): number {
  const leftRank = getOpenCodeTeamModelRecommendationSortRank(leftModelId);
  const rightRank = getOpenCodeTeamModelRecommendationSortRank(rightModelId);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return 0;
}
