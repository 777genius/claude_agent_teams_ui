import { describe, expect, it } from 'vitest';

import { getVisibleTeamProviderModels } from '@renderer/utils/teamModelCatalog';

describe('teamModelCatalog', () => {
  it('filters UI-disabled Codex models from provider badge lists', () => {
    expect(
      getVisibleTeamProviderModels('codex', [
        'gpt-5.4',
        'gpt-5.4-mini',
        'gpt-5.3-codex',
        'gpt-5.3-codex-spark',
        'gpt-5.2',
        'gpt-5.2-codex',
        'gpt-5.1-codex-mini',
        'gpt-5.1-codex-max',
      ])
    ).toEqual([
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.3-codex',
      'gpt-5.2',
      'gpt-5.1-codex-max',
    ]);
  });
});
