import { describe, expect, it, vi } from 'vitest';

import { runProviderPrepareDiagnostics } from '@renderer/components/team/dialogs/providerPrepareDiagnostics';
import { DEFAULT_PROVIDER_MODEL_SELECTION } from '@shared/utils/providerModelSelection';

import type { TeamProvisioningPrepareResult } from '@shared/types';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('runProviderPrepareDiagnostics', () => {
  it('returns a failed provider result immediately when runtime preflight fails', async () => {
    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[]
      ) => Promise<TeamProvisioningPrepareResult>
    >().mockResolvedValue({
      ready: false,
      message: 'Codex runtime is not authenticated.',
    });

    const result = await runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'codex',
      selectedModelIds: ['gpt-5.4'],
      prepareProvisioning,
    });

    expect(result.status).toBe('failed');
    expect(result.details).toEqual(['Codex runtime is not authenticated.']);
    expect(prepareProvisioning).toHaveBeenCalledTimes(1);
  });

  it('emits per-model progress updates and keeps failures scoped to the affected model', async () => {
    const deferred54 = createDeferred<TeamProvisioningPrepareResult>();
    const deferred52 = createDeferred<TeamProvisioningPrepareResult>();
    const progressUpdates: Array<{ details: string[]; completedCount: number; totalCount: number }> =
      [];

    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[]
      ) => Promise<TeamProvisioningPrepareResult>
    >((_, __, ___, selectedModels) => {
      if (!selectedModels || selectedModels.length === 0) {
        return Promise.resolve({
          ready: true,
          message: 'CLI is warmed up and ready to launch',
        });
      }
      if (selectedModels[0] === 'gpt-5.4') {
        return deferred54.promise;
      }
      return deferred52.promise;
    });

    const resultPromise = runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'codex',
      selectedModelIds: ['gpt-5.4', 'gpt-5.2-codex'],
      prepareProvisioning,
      onModelProgress: (progress) => progressUpdates.push(progress),
    });

    await Promise.resolve();
    expect(progressUpdates[0]).toEqual({
      completedCount: 0,
      totalCount: 2,
      details: ['5.4 - checking...', '5.2 Codex - checking...'],
    });

    deferred54.resolve({
      ready: true,
      message: 'CLI is warmed up and ready to launch',
      details: ['Selected model gpt-5.4 verified for launch.'],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(progressUpdates.at(-1)).toEqual({
      completedCount: 1,
      totalCount: 2,
      details: ['5.4 - verified', '5.2 Codex - checking...'],
    });

    deferred52.resolve({
      ready: false,
      message:
        "Selected model gpt-5.2-codex is unavailable. The 'gpt-5.2-codex' model is not supported when using Codex with a ChatGPT account.",
    });
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    expect(result.details).toEqual([
      '5.4 - verified',
      '5.2 Codex - unavailable - Not available with Codex ChatGPT subscription',
    ]);
    expect(progressUpdates.at(-1)).toEqual({
      completedCount: 2,
      totalCount: 2,
      details: [
        '5.4 - verified',
        '5.2 Codex - unavailable - Not available with Codex ChatGPT subscription',
      ],
    });
  });

  it('normalizes raw Codex API error envelopes into a clean model reason', async () => {
    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[]
      ) => Promise<TeamProvisioningPrepareResult>
    >((_, __, ___, selectedModels) => {
      if (!selectedModels || selectedModels.length === 0) {
        return Promise.resolve({
          ready: true,
          message: 'CLI is warmed up and ready to launch',
        });
      }
      return Promise.resolve({
        ready: false,
        message:
          `API Error: 400 {"type":"error","error":{"type":"api_error","message":"Codex API error (400): {\\"detail\\":\\"The 'gpt-5.1-codex-max' model is not supported when using Codex with a ChatGPT account.\\"}"}}`,
      });
    });

    const result = await runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'codex',
      selectedModelIds: ['gpt-5.1-codex-max'],
      prepareProvisioning,
    });

    expect(result.status).toBe('failed');
    expect(result.details).toEqual([
      '5.1 Codex Max - unavailable - Not available with Codex ChatGPT subscription',
    ]);
  });

  it('normalizes raw timeout probe errors into a provider-agnostic reason', async () => {
    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[]
      ) => Promise<TeamProvisioningPrepareResult>
    >((_, __, ___, selectedModels) => {
      if (!selectedModels || selectedModels.length === 0) {
        return Promise.resolve({
          ready: true,
          message: 'CLI is warmed up and ready to launch',
        });
      }
      return Promise.resolve({
        ready: true,
        message: 'CLI is warmed up and ready to launch',
        warnings: [
          'Selected model gpt-5.3-codex could not be verified. Timeout running: claude -p Output only the single word PONG. --output-format text --model gpt-5.3-codex --max-turns 1 --no-session-persistence',
        ],
      });
    });

    const result = await runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'codex',
      selectedModelIds: ['gpt-5.3-codex'],
      prepareProvisioning,
    });

    expect(result.status).toBe('notes');
    expect(result.details).toEqual(['5.3 Codex - check failed - Model verification timed out']);
  });

  it('renders the provider default model as a dedicated Default check line', async () => {
    const progressUpdates: Array<{ details: string[]; completedCount: number; totalCount: number }> =
      [];
    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[]
      ) => Promise<TeamProvisioningPrepareResult>
    >((_, __, ___, selectedModels) => {
      if (!selectedModels || selectedModels.length === 0) {
        return Promise.resolve({
          ready: true,
          message: 'CLI is warmed up and ready to launch',
        });
      }
      return Promise.resolve({
        ready: true,
        message: 'CLI is warmed up and ready to launch',
        details: [`Selected model ${DEFAULT_PROVIDER_MODEL_SELECTION} verified for launch.`],
      });
    });

    const result = await runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'codex',
      selectedModelIds: [DEFAULT_PROVIDER_MODEL_SELECTION],
      prepareProvisioning,
      onModelProgress: (progress) => progressUpdates.push(progress),
    });

    expect(progressUpdates[0]).toEqual({
      completedCount: 0,
      totalCount: 1,
      details: ['Default - checking...'],
    });
    expect(result.status).toBe('ready');
    expect(result.details).toEqual(['Default - verified']);
  });

  it('forwards limitContext through model diagnostics for Anthropic default checks', async () => {
    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[],
        limitContext?: boolean
      ) => Promise<TeamProvisioningPrepareResult>
    >((_, __, ___, selectedModels) => {
      if (!selectedModels || selectedModels.length === 0) {
        return Promise.resolve({
          ready: true,
          message: 'CLI is warmed up and ready to launch',
        });
      }
      return Promise.resolve({
        ready: true,
        message: 'CLI is warmed up and ready to launch',
        details: [`Selected model ${DEFAULT_PROVIDER_MODEL_SELECTION} verified for launch.`],
      });
    });

    const result = await runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'anthropic',
      selectedModelIds: [DEFAULT_PROVIDER_MODEL_SELECTION],
      limitContext: true,
      prepareProvisioning,
    });

    expect(result.details).toEqual(['Default - verified']);
    expect(prepareProvisioning).toHaveBeenNthCalledWith(
      1,
      '/tmp/project',
      'anthropic',
      ['anthropic'],
      undefined,
      true
    );
    expect(prepareProvisioning).toHaveBeenNthCalledWith(
      2,
      '/tmp/project',
      'anthropic',
      ['anthropic'],
      [DEFAULT_PROVIDER_MODEL_SELECTION],
      true
    );
  });

  it('reuses cached model results and probes only newly selected models', async () => {
    const progressUpdates: Array<{ details: string[]; completedCount: number; totalCount: number }> =
      [];
    const prepareProvisioning = vi.fn<
      (
        cwd?: string,
        providerId?: 'anthropic' | 'codex' | 'gemini',
        providerIds?: ('anthropic' | 'codex' | 'gemini')[],
        selectedModels?: string[]
      ) => Promise<TeamProvisioningPrepareResult>
    >((_, __, ___, selectedModels) => {
      if (!selectedModels || selectedModels.length === 0) {
        return Promise.resolve({
          ready: true,
          message: 'CLI is warmed up and ready to launch',
        });
      }

      expect(selectedModels).toEqual(['gpt-5.2-codex']);
      return Promise.resolve({
        ready: false,
        message:
          "Selected model gpt-5.2-codex is unavailable. The 'gpt-5.2-codex' model is not supported when using Codex with a ChatGPT account.",
      });
    });

    const result = await runProviderPrepareDiagnostics({
      cwd: '/tmp/project',
      providerId: 'codex',
      selectedModelIds: ['gpt-5.2', 'gpt-5.4-mini', 'gpt-5.2-codex'],
      prepareProvisioning,
      cachedModelResultsById: {
        'gpt-5.2': {
          status: 'ready',
          line: '5.2 - verified',
          warningLine: null,
        },
        'gpt-5.4-mini': {
          status: 'ready',
          line: '5.4 Mini - verified',
          warningLine: null,
        },
      },
      onModelProgress: (progress) => progressUpdates.push(progress),
    });

    expect(progressUpdates[0]).toEqual({
      completedCount: 2,
      totalCount: 3,
      details: ['5.2 - verified', '5.4 Mini - verified', '5.2 Codex - checking...'],
    });
    expect(result.details).toEqual([
      '5.2 - verified',
      '5.4 Mini - verified',
      '5.2 Codex - unavailable - Not available with Codex ChatGPT subscription',
    ]);
    expect(prepareProvisioning).toHaveBeenCalledTimes(2);
    expect(prepareProvisioning).toHaveBeenNthCalledWith(
      1,
      '/tmp/project',
      'codex',
      ['codex'],
      undefined,
      undefined
    );
    expect(prepareProvisioning).toHaveBeenNthCalledWith(2, '/tmp/project', 'codex', ['codex'], [
      'gpt-5.2-codex',
    ], undefined);
  });
});
