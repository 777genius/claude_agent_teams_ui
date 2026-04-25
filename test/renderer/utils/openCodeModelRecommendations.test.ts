import { describe, expect, it } from 'vitest';

import {
  compareOpenCodeTeamModelRecommendations,
  getOpenCodeTeamModelRecommendation,
  isOpenCodeTeamModelRecommended,
} from '@renderer/utils/openCodeModelRecommendations';

describe('getOpenCodeTeamModelRecommendation', () => {
  it('marks models that passed real OpenCode Agent Teams E2E as recommended', () => {
    expect(getOpenCodeTeamModelRecommendation('openrouter/qwen/qwen3-coder-flash')).toMatchObject({
      level: 'recommended',
      label: 'Recommended',
    });
    expect(
      getOpenCodeTeamModelRecommendation(' OPENROUTER/GOOGLE/GEMINI-2.5-FLASH-LITE ')
    ).toMatchObject({
      level: 'recommended',
      label: 'Recommended',
    });
    expect(isOpenCodeTeamModelRecommended('openrouter/qwen/qwen3-coder-flash')).toBe(true);
  });

  it('keeps similarly named models distinct when real E2E disagreed', () => {
    expect(getOpenCodeTeamModelRecommendation('opencode/minimax-m2.5-free')).toMatchObject({
      level: 'recommended',
    });
    expect(
      getOpenCodeTeamModelRecommendation('openrouter/minimax/minimax-m2.5:free')
    ).toMatchObject({
      level: 'not-recommended',
    });
  });

  it('marks models with real launch or messaging failures as not recommended', () => {
    expect(getOpenCodeTeamModelRecommendation('openrouter/openai/gpt-oss-20b:free')).toMatchObject({
      level: 'not-recommended',
      label: 'Not recommended',
    });
    expect(
      getOpenCodeTeamModelRecommendation('openrouter/google/gemini-3-pro-preview')
    ).toMatchObject({
      level: 'not-recommended',
      label: 'Not recommended',
    });
  });

  it('does not label noisy or unproven models as good or bad', () => {
    expect(getOpenCodeTeamModelRecommendation('opencode/big-pickle')).toBeNull();
    expect(getOpenCodeTeamModelRecommendation('openrouter/x-ai/grok-code-fast-1')).toBeNull();
    expect(getOpenCodeTeamModelRecommendation('')).toBeNull();
  });

  it('sorts recommended routes before neutral routes and not-recommended routes last', () => {
    const models = [
      'openrouter/openai/gpt-oss-20b:free',
      'opencode/big-pickle',
      'openrouter/qwen/qwen3-coder-flash',
    ];

    expect(
      [...models].sort((left, right) => compareOpenCodeTeamModelRecommendations(left, right))
    ).toEqual([
      'openrouter/qwen/qwen3-coder-flash',
      'opencode/big-pickle',
      'openrouter/openai/gpt-oss-20b:free',
    ]);
  });
});
