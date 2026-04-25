import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useRuntimeProviderManagement,
  type RuntimeProviderManagementActions,
  type RuntimeProviderManagementState,
} from '../../../../src/features/runtime-provider-management/renderer/hooks/useRuntimeProviderManagement';
import {
  getStoredCreateTeamModel,
  getStoredCreateTeamProvider,
} from '../../../../src/renderer/services/createTeamPreferences';

import type { ElectronAPI } from '../../../../src/shared/types/api';
import type { RuntimeProviderManagementModelTestResponse } from '../../../../src/features/runtime-provider-management/contracts';

function installRuntimeProviderManagementApi(response: RuntimeProviderManagementModelTestResponse): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      runtimeProviderManagement: {
        testModel: vi.fn(() => Promise.resolve(response)),
      },
    } as unknown as ElectronAPI,
  });
}

describe('useRuntimeProviderManagement', () => {
  let host: HTMLDivElement;
  let state: RuntimeProviderManagementState | null = null;
  let actions: RuntimeProviderManagementActions | null = null;

  function Harness(): React.ReactElement {
    const hook = useRuntimeProviderManagement({
      runtimeId: 'opencode',
      enabled: false,
    });
    state = hook[0];
    actions = hook[1];
    return React.createElement('div');
  }

  function EnabledHarness(props: { projectPath?: string | null }): React.ReactElement {
    const hook = useRuntimeProviderManagement({
      runtimeId: 'opencode',
      enabled: true,
      projectPath: props.projectPath,
    });
    state = hook[0];
    actions = hook[1];
    return React.createElement('div');
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    host = document.createElement('div');
    document.body.appendChild(host);
    window.localStorage.clear();
    state = null;
    actions = null;
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'electronAPI');
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('uses a clicked model as the app default for new teams without a global success banner', async () => {
    const modelId = 'openrouter/openai/gpt-oss-20b:free';
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    act(() => {
      actions?.useModelForNewTeams(modelId);
    });

    expect(state?.selectedModelId).toBe(modelId);
    expect(state?.successMessage).toBeNull();
    expect(getStoredCreateTeamProvider()).toBe('opencode');
    expect(getStoredCreateTeamModel('opencode')).toBe(modelId);
  });

  it('passes projectPath to the runtime provider management API', async () => {
    const loadView = vi.fn(() =>
      Promise.resolve({
        schemaVersion: 1,
        runtimeId: 'opencode',
        view: {
          runtimeId: 'opencode',
          title: 'OpenCode',
          runtime: {
            state: 'ready',
            cliPath: '/opt/homebrew/bin/opencode',
            version: '1.0.0',
            managedProfile: 'active',
            localAuth: 'synced',
          },
          providers: [],
          defaultModel: null,
          fallbackModel: null,
          diagnostics: [],
        },
      })
    );
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        runtimeProviderManagement: {
          loadView,
        },
      } as unknown as ElectronAPI,
    });

    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(EnabledHarness, { projectPath: '/tmp/project-a' }));
      await Promise.resolve();
    });

    expect(loadView).toHaveBeenCalledWith({
      runtimeId: 'opencode',
      projectPath: '/tmp/project-a',
    });
  });

  it('keeps failed model probes scoped to the model result instead of a global success banner', async () => {
    const modelId = 'openrouter/anthropic/claude-3.5-haiku';
    const message =
      'This request requires more credits, or fewer max_tokens. You requested up to 8192 tokens, but can only afford 381.';
    installRuntimeProviderManagementApi({
      schemaVersion: 1,
      runtimeId: 'opencode',
      result: {
        providerId: 'openrouter',
        modelId,
        ok: false,
        availability: 'unavailable',
        message,
        diagnostics: [],
      },
    });

    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      await actions?.testModel('openrouter', modelId);
    });

    expect(state?.successMessage).toBeNull();
    expect(state?.error).toBeNull();
    expect(state?.modelResults[modelId]?.ok).toBe(false);
    expect(state?.modelResults[modelId]?.message).toBe(message);
  });

  it('keeps successful model probes scoped to the model card instead of a global success banner', async () => {
    const modelId = 'openrouter/openai/gpt-oss-20b:free';
    installRuntimeProviderManagementApi({
      schemaVersion: 1,
      runtimeId: 'opencode',
      result: {
        providerId: 'openrouter',
        modelId,
        ok: true,
        availability: 'available',
        message: 'Model probe passed',
        diagnostics: [],
      },
    });

    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });

    await act(async () => {
      await actions?.testModel('openrouter', modelId);
    });

    expect(state?.successMessage).toBeNull();
    expect(state?.error).toBeNull();
    expect(state?.modelResults[modelId]?.ok).toBe(true);
    expect(state?.modelResults[modelId]?.message).toBe('Model probe passed');
  });
});
