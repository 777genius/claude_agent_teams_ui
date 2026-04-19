import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface StoreState {
  cliStatus: Record<string, unknown> | null;
  cliStatusLoading: boolean;
  cliProviderStatusLoading: Record<string, boolean>;
  cliStatusError: string | null;
  cliInstallerState:
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'installing'
    | 'completed'
    | 'error';
  cliDownloadProgress: number;
  cliDownloadTransferred: number;
  cliDownloadTotal: number;
  cliInstallerError: string | null;
  cliInstallerDetail: string | null;
  cliInstallerRawChunks: string[];
  cliCompletedVersion: string | null;
  bootstrapCliStatus: ReturnType<typeof vi.fn>;
  fetchCliStatus: ReturnType<typeof vi.fn>;
  fetchCliProviderStatus: ReturnType<typeof vi.fn>;
  invalidateCliStatus: ReturnType<typeof vi.fn>;
  installCli: ReturnType<typeof vi.fn>;
  appConfig: {
    general: {
      multimodelEnabled: boolean;
    };
    runtime?: {
      providerBackends?: Record<string, string>;
    };
  };
  updateConfig: ReturnType<typeof vi.fn>;
  openExtensionsTab: ReturnType<typeof vi.fn>;
}

const storeState = {} as StoreState;
let providerRuntimeSettingsDialogProps: {
  onSelectBackend?: (providerId: string, backendId: string) => Promise<void> | void;
  open?: boolean;
  initialProviderId?: string;
} | null = null;

vi.mock('@renderer/api', () => ({
  api: {
    showInFolder: vi.fn(),
  },
  isElectronMode: () => true,
}));

vi.mock('@renderer/components/common/ConfirmDialog', () => ({
  confirm: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@renderer/components/runtime/ProviderRuntimeSettingsDialog', () => ({
  ProviderRuntimeSettingsDialog: (props: {
    onSelectBackend?: (providerId: string, backendId: string) => Promise<void> | void;
    open?: boolean;
    initialProviderId?: string;
  }) => {
    providerRuntimeSettingsDialogProps = props;
    return React.createElement(
      'div',
      {
        'data-testid': 'provider-runtime-settings-dialog',
        'data-open': String(Boolean(props.open)),
        'data-provider': props.initialProviderId ?? '',
      },
      null
    );
  },
}));

vi.mock('@renderer/components/runtime/ProviderRuntimeBackendSelector', async () => {
  const actual =
    await vi.importActual<typeof import('@renderer/components/runtime/ProviderRuntimeBackendSelector')>(
      '@renderer/components/runtime/ProviderRuntimeBackendSelector'
    );
  return {
    getProviderRuntimeBackendSummary: actual.getProviderRuntimeBackendSummary,
  };
});

vi.mock('@renderer/components/settings/components', async () => {
  const actual = await vi.importActual<object>('@renderer/components/settings/components');
  return {
    ...actual,
    SettingsToggle: ({
      enabled,
      disabled,
      onChange,
    }: {
      enabled: boolean;
      disabled?: boolean;
      onChange: (value: boolean) => void;
    }) =>
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'multimodel-toggle',
          disabled,
          onClick: () => onChange(!enabled),
        },
        enabled ? 'toggle-on' : 'toggle-off'
      ),
  };
});

vi.mock('@renderer/components/terminal/TerminalLogPanel', () => ({
  TerminalLogPanel: () => React.createElement('div', null, 'terminal-log'),
}));

vi.mock('@renderer/components/terminal/TerminalModal', () => ({
  TerminalModal: () => React.createElement('div', { 'data-testid': 'terminal-modal' }, 'terminal'),
}));

vi.mock('@renderer/store', () => {
  const useStore = (selector: (state: StoreState) => unknown) => selector(storeState);
  Object.assign(useStore, {
    setState: vi.fn(),
  });
  return { useStore };
});

import { CliStatusBanner } from '@renderer/components/dashboard/CliStatusBanner';
import { CliStatusSection } from '@renderer/components/settings/sections/CliStatusSection';

function createInstalledCliStatus(
  overrides?: Partial<Record<string, unknown>>
): Record<string, unknown> {
  return {
    flavor: 'claude',
    displayName: 'Claude CLI',
    supportsSelfUpdate: true,
    showVersionDetails: true,
    showBinaryPath: true,
    installed: true,
    installedVersion: '2.1.100',
    binaryPath: '/usr/local/bin/claude',
    latestVersion: null,
    updateAvailable: false,
    authLoggedIn: false,
    authStatusChecking: false,
    authMethod: null,
    providers: [],
    ...overrides,
  };
}

function createApiKeyMisconfiguredProvider(
  providerId: 'anthropic' | 'codex'
): Record<string, unknown> {
  return {
    providerId,
    displayName: providerId === 'anthropic' ? 'Anthropic' : 'Codex',
    supported: true,
    authenticated: false,
    authMethod: null,
    verificationState: 'error',
    statusMessage:
      providerId === 'anthropic'
        ? 'Anthropic API key mode is enabled, but no ANTHROPIC_API_KEY is configured.'
        : 'Codex native runtime requires OPENAI_API_KEY or CODEX_API_KEY.',
    models: [],
    canLoginFromUi: providerId === 'anthropic',
    capabilities: {
      teamLaunch: true,
      oneShot: true,
    },
    connection: {
      supportsOAuth: providerId === 'anthropic',
      supportsApiKey: true,
      configurableAuthModes:
        providerId === 'anthropic' ? ['auto', 'oauth', 'api_key'] : [],
      configuredAuthMode: providerId === 'anthropic' ? 'api_key' : null,
      apiKeyConfigured: false,
      apiKeySource: null,
      apiKeySourceLabel: null,
    },
  };
}

function createApiKeyModeProviderIssue(providerId: 'anthropic' | 'codex'): Record<string, unknown> {
  return {
    ...createApiKeyMisconfiguredProvider(providerId),
    statusMessage:
      providerId === 'anthropic'
        ? 'Anthropic API key was rejected by the runtime.'
        : 'Codex native runtime is unavailable because the configured API key was rejected.',
    connection: {
      ...(createApiKeyMisconfiguredProvider(providerId) as { connection: Record<string, unknown> })
        .connection,
      apiKeyConfigured: true,
      apiKeySource: 'stored',
      apiKeySourceLabel:
        providerId === 'anthropic' ? 'Stored Anthropic API key' : 'Stored Codex API key',
    },
  };
}

function createCodexNativeRolloutProvider(
  overrides?: Partial<Record<string, unknown>> & {
    state?: 'ready' | 'authentication-required' | 'runtime-missing' | 'degraded';
    audience?: 'general';
    selectable?: boolean;
    available?: boolean;
    statusMessage?: string | null;
    detailMessage?: string | null;
  }
): Record<string, unknown> {
  return {
    providerId: 'codex',
    displayName: 'Codex',
    supported: true,
    authenticated: overrides?.state === 'ready' || overrides?.available === true,
    authMethod: overrides?.state === 'ready' || overrides?.available === true ? 'api_key' : null,
    verificationState:
      overrides?.state === 'ready' || overrides?.available === true ? 'verified' : 'unknown',
    statusMessage: overrides?.statusMessage ?? 'Ready',
    detailMessage:
      overrides?.detailMessage ?? 'Codex native runtime is ready through the local codex exec seam.',
    selectedBackendId: 'codex-native',
    resolvedBackendId:
      overrides?.state === 'ready' || overrides?.available === true ? 'codex-native' : null,
    models: ['gpt-5-codex'],
    canLoginFromUi: false,
    capabilities: {
      teamLaunch: true,
      oneShot: true,
    },
    availableBackends: [
      {
        id: 'codex-native',
        label: 'Codex native',
        description: 'Use codex exec JSON mode.',
        selectable: overrides?.selectable ?? true,
        recommended: true,
        available: overrides?.available ?? true,
        state: overrides?.state ?? 'ready',
        audience: overrides?.audience ?? 'general',
        statusMessage: overrides?.statusMessage ?? 'Ready',
        detailMessage:
          overrides?.detailMessage ?? 'Codex native runtime is ready through the local codex exec seam.',
      },
    ],
    backend:
      overrides?.state === 'ready' || overrides?.available === true
        ? {
            kind: 'codex-native',
            label: 'Codex native',
            endpointLabel: 'codex exec --json',
            authMethodDetail: 'api_key',
          }
        : null,
    ...overrides,
  };
}

describe('CLI status visibility during completed install state', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  beforeEach(() => {
    providerRuntimeSettingsDialogProps = null;
    storeState.cliStatus = createInstalledCliStatus();
    storeState.cliStatusLoading = false;
    storeState.cliProviderStatusLoading = {};
    storeState.cliStatusError = null;
    storeState.cliInstallerState = 'completed';
    storeState.cliDownloadProgress = 0;
    storeState.cliDownloadTransferred = 0;
    storeState.cliDownloadTotal = 0;
    storeState.cliInstallerError = null;
    storeState.cliInstallerDetail = null;
    storeState.cliInstallerRawChunks = [];
    storeState.cliCompletedVersion = '2.1.100';
    storeState.bootstrapCliStatus = vi.fn().mockResolvedValue(undefined);
    storeState.fetchCliStatus = vi.fn().mockResolvedValue(undefined);
    storeState.fetchCliProviderStatus = vi.fn().mockResolvedValue(undefined);
    storeState.invalidateCliStatus = vi.fn().mockResolvedValue(undefined);
    storeState.installCli = vi.fn();
    storeState.appConfig = {
      general: {
        multimodelEnabled: true,
      },
      runtime: {
        providerBackends: {},
      },
    };
    storeState.updateConfig = vi.fn().mockResolvedValue(undefined);
    storeState.openExtensionsTab = vi.fn();
  });

  it('keeps the Multimodel toggle visible and enabled on the dashboard while login is still required', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Multimodel');
    expect(host.textContent).toContain('Login');

    const toggle = host.querySelector('[data-testid="multimodel-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps authenticated dashboard actions visible after install completion', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: true,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Extensions');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps the dashboard Extensions button visible before authentication completes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: false,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    const extensionsButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Extensions')
    );
    expect(extensionsButton).not.toBeNull();

    await act(async () => {
      extensionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(storeState.openExtensionsTab).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('preserves dashboard runtime backend refresh errors for the manage dialog', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.fetchCliProviderStatus = vi.fn(() => Promise.reject(new Error('refresh failed')));

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    const onSelectBackend = providerRuntimeSettingsDialogProps?.onSelectBackend;
    expect(onSelectBackend).toBeTypeOf('function');

    await expect(onSelectBackend?.('codex', 'codex-native')).rejects.toThrow(
      'Runtime updated, but failed to refresh provider status.'
    );
    expect(storeState.updateConfig).toHaveBeenCalledWith('runtime', {
      providerBackends: {
        codex: 'codex-native',
      },
    });
    expect(storeState.fetchCliProviderStatus).toHaveBeenCalledWith('codex');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps auth verification inside the main installed banner instead of rendering a second banner', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: false,
      authStatusChecking: true,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Checking authentication...');
    expect(host.textContent).not.toContain('Verifying authentication...');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('does not fall back to direct-Claude auth copy when only hidden multimodel providers are available', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      flavor: 'agent_teams_orchestrator',
      authLoggedIn: true,
      providers: [
        {
          providerId: 'gemini',
          displayName: 'Gemini',
          supported: true,
          authenticated: true,
          authMethod: 'cli_oauth_personal',
          verificationState: 'verified',
          statusMessage: 'Resolved to CLI SDK',
          models: [],
          canLoginFromUi: true,
          capabilities: {
            teamLaunch: true,
            oneShot: true,
          },
        },
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).not.toContain('Authenticated');
    expect(host.textContent).not.toContain('Providers:');
    expect((host.firstElementChild as HTMLElement | null)?.getAttribute('style')).toContain(
      '245, 158, 11'
    );

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps the dashboard banner in warning state when only hidden providers are authenticated', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      flavor: 'agent_teams_orchestrator',
      authLoggedIn: true,
      showVersionDetails: false,
      showBinaryPath: false,
      supportsSelfUpdate: false,
      providers: [
        {
          providerId: 'anthropic',
          displayName: 'Anthropic',
          supported: true,
          authenticated: false,
          authMethod: null,
          verificationState: 'unknown',
          statusMessage: 'Authentication required',
          models: [],
          canLoginFromUi: true,
          capabilities: {
            teamLaunch: true,
            oneShot: true,
          },
        },
        {
          providerId: 'codex',
          displayName: 'Codex',
          supported: true,
          authenticated: false,
          authMethod: null,
          verificationState: 'unknown',
          statusMessage: 'Authentication required',
          models: [],
          canLoginFromUi: true,
          capabilities: {
            teamLaunch: true,
            oneShot: true,
          },
        },
        {
          providerId: 'gemini',
          displayName: 'Gemini',
          supported: true,
          authenticated: true,
          authMethod: 'cli_oauth_personal',
          verificationState: 'verified',
          statusMessage: 'Resolved to CLI SDK',
          models: [],
          canLoginFromUi: true,
          capabilities: {
            teamLaunch: true,
            oneShot: true,
          },
        },
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Providers: 0/2 connected');
    expect((host.firstElementChild as HTMLElement | null)?.getAttribute('style')).toContain(
      '245, 158, 11'
    );

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('shows a degraded runtime warning when a binary is found but the health check fails', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      installed: false,
      installedVersion: null,
      binaryPath: '/Users/tester/.claude/local/node_modules/.bin/claude',
      launchError: 'spawn EACCES',
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('failed to start');
    expect(host.textContent).toContain('Reinstall Claude CLI');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps installed controls visible in settings and wires the Extensions button correctly', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: true,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusSection));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Installed v2.1.100');
    expect(host.textContent).toContain('Multimodel');
    expect(host.textContent).toContain('Extensions');

    const extensionsButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Extensions')
    );
    expect(extensionsButton).not.toBeNull();

    await act(async () => {
      extensionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(storeState.openExtensionsTab).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('preserves settings runtime backend refresh errors for the manage dialog', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.fetchCliProviderStatus = vi.fn(() => Promise.reject(new Error('refresh failed')));

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusSection));
      await Promise.resolve();
    });

    const onSelectBackend = providerRuntimeSettingsDialogProps?.onSelectBackend;
    expect(onSelectBackend).toBeTypeOf('function');

    await expect(onSelectBackend?.('codex', 'api')).rejects.toThrow(
      'Runtime updated, but failed to refresh provider status.'
    );
    expect(storeState.updateConfig).toHaveBeenCalledWith('runtime', {
      providerBackends: {
        codex: 'api',
      },
    });
    expect(storeState.fetchCliProviderStatus).toHaveBeenCalledWith('codex');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps the settings Extensions button visible when the runtime is installed but not authenticated yet', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: false,
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusSection));
      await Promise.resolve();
    });

    const extensionsButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Extensions')
    );
    expect(extensionsButton).not.toBeNull();

    await act(async () => {
      extensionsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(storeState.openExtensionsTab).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('routes API-key misconfiguration to provider settings instead of login', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: false,
      providers: [createApiKeyMisconfiguredProvider('anthropic')],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('API key required');
    expect(host.textContent).toContain('Manage Providers');
    expect(host.textContent).not.toContain('Already logged in?');
    expect(host.textContent).not.toContain('Login');

    const manageButton = Array.from(host.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Manage Providers')
    );
    expect(manageButton).not.toBeUndefined();

    await act(async () => {
      manageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const dialog = host.querySelector('[data-testid="provider-runtime-settings-dialog"]');
    expect(dialog?.getAttribute('data-open')).toBe('true');
    expect(dialog?.getAttribute('data-provider')).toBe('anthropic');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps API-key mode issues on provider settings even when a saved key exists', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      authLoggedIn: false,
      providers: [createApiKeyModeProviderIssue('anthropic')],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Provider action required');
    expect(host.textContent).toContain('Manage Providers');
    expect(host.textContent).not.toContain('Already logged in?');
    expect(host.textContent).not.toContain('Login');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('shows runtime model availability badges on the dashboard without hiding native Codex models', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      flavor: 'agent_teams_orchestrator',
      displayName: 'agent_teams_orchestrator',
      supportsSelfUpdate: false,
      showVersionDetails: false,
      showBinaryPath: false,
      authLoggedIn: true,
      providers: [
        {
          providerId: 'codex',
          displayName: 'Codex',
          supported: true,
          authenticated: true,
          authMethod: 'api_key',
          verificationState: 'verified',
          modelVerificationState: 'verified',
          statusMessage: null,
          models: ['gpt-5.4', 'gpt-5.1-codex-max', 'gpt-5.2-codex'],
          modelAvailability: [
            { modelId: 'gpt-5.4', status: 'available', checkedAt: '2026-04-16T12:00:00.000Z' },
            {
              modelId: 'gpt-5.1-codex-max',
              status: 'unavailable',
              reason: 'The requested model is not available for your account.',
              checkedAt: '2026-04-16T12:00:00.000Z',
            },
            {
              modelId: 'gpt-5.2-codex',
              status: 'unavailable',
              reason: 'The requested model is not available for your account.',
              checkedAt: '2026-04-16T12:00:00.000Z',
            },
          ],
          canLoginFromUi: false,
          capabilities: {
            teamLaunch: true,
            oneShot: true,
          },
          backend: {
            kind: 'codex-native',
            label: 'Codex native',
            endpointLabel: 'codex exec --json',
          },
        },
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('5.4');
    expect(host.textContent).toContain('5.1-codex-max');
    expect(host.textContent).not.toContain('5.2-codex');
    expect(host.textContent).toContain('Unavailable');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps dashboard codex-native truth explicit for ready native lanes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      flavor: 'agent_teams_orchestrator',
      displayName: 'agent_teams_orchestrator',
      supportsSelfUpdate: false,
      showVersionDetails: false,
      showBinaryPath: false,
      authLoggedIn: true,
      providers: [
        createCodexNativeRolloutProvider({
          state: 'ready',
          available: true,
          selectable: true,
          audience: 'general',
          statusMessage: 'Ready',
          detailMessage: 'Codex native runtime is ready through the local codex exec seam.',
        }),
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusBanner));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Ready');
    expect(host.textContent).toContain('Runtime: Codex native');
    expect(host.textContent).not.toContain('Connected via API key');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });

  it('keeps settings codex-native rollout truth explicit for runtime-missing lanes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.cliInstallerState = 'idle';
    storeState.cliStatus = createInstalledCliStatus({
      flavor: 'agent_teams_orchestrator',
      displayName: 'agent_teams_orchestrator',
      supportsSelfUpdate: false,
      showVersionDetails: false,
      showBinaryPath: false,
      authLoggedIn: false,
      providers: [
        createCodexNativeRolloutProvider({
          authenticated: false,
          authMethod: null,
          verificationState: 'unknown',
          state: 'runtime-missing',
          available: false,
          selectable: false,
          statusMessage: 'Codex CLI not found',
          detailMessage: 'Codex native runtime requires the codex CLI binary to be installed and discoverable.',
          backend: null,
          resolvedBackendId: null,
        }),
      ],
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(CliStatusSection));
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Codex CLI not found');
    expect(host.textContent).toContain('Runtime: Codex native - runtime missing');
    expect(host.textContent).not.toContain('Connected via API key');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
