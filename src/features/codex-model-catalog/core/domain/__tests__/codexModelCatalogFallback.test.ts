import { describe, expect, it } from 'vitest';

import { createStaticCodexModelCatalogModels } from '../codexModelCatalogFallback';

describe('createStaticCodexModelCatalogModels', () => {
  it('includes GPT-5.5 without changing the default from GPT-5.4', () => {
    const models = createStaticCodexModelCatalogModels();

    expect(models.map((model) => model.launchModel)).toContain('gpt-5.5');
    expect(models.find((model) => model.isDefault)?.launchModel).toBe('gpt-5.4');
  });
});
