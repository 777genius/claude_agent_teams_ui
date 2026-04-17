import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CliInstallationStatus } from '@shared/types';

interface StoreState {
  fetchPluginCatalog: ReturnType<typeof vi.fn>;
  fetchCliStatus: ReturnType<typeof vi.fn>;
  fetchApiKeys: ReturnType<typeof vi.fn>;
  fetchSkillsCatalog: ReturnType<typeof vi.fn>;
  mcpBrowse: ReturnType<typeof vi.fn>;
  mcpFetchInstalled: ReturnType<typeof vi.fn>;
  apiKeysLoading: boolean;
  pluginCatalogLoading: boolean;
  mcpBrowseLoading: boolean;
  skillsLoading: boolean;
  cliStatus: CliInstallationStatus | null;
  cliStatusLoading: boolean;
  cliProviderStatusLoading: Record<string, boolean>;
  openDashboard: ReturnType<typeof vi.fn>;
  sessions: Array<{ isOngoing: boolean }>;
  projects: unknown[];
  repositoryGroups: unknown[];
}

const storeState = {} as StoreState;

vi.mock('@renderer/store', () => ({
  useStore: (selector: (state: StoreState) => unknown) => selector(storeState),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}));

vi.mock('@renderer/api', () => ({
  api: {
    plugins: {},
    mcpRegistry: {},
    skills: {},
  },
}));

vi.mock('@renderer/contexts/useTabUIContext', () => ({
  useTabIdOptional: () => undefined,
}));

vi.mock('@renderer/hooks/useExtensionsTabState', () => ({
  useExtensionsTabState: () => ({
    activeSubTab: 'plugins',
    setActiveSubTab: vi.fn(),
    pluginFilters: {
      search: '',
      categories: [],
      capabilities: [],
      installedOnly: false,
    },
    pluginSort: { field: 'popularity', order: 'desc' },
    setPluginSort: vi.fn(),
    selectedPluginId: null,
    setSelectedPluginId: vi.fn(),
    updatePluginSearch: vi.fn(),
    toggleCategory: vi.fn(),
    toggleCapability: vi.fn(),
    toggleInstalledOnly: vi.fn(),
    clearFilters: vi.fn(),
    hasActiveFilters: false,
    mcpSearchQuery: '',
    mcpSearch: vi.fn(),
    mcpSearchResults: [],
    mcpSearchLoading: false,
    mcpSearchWarnings: [],
    selectedMcpServerId: null,
    setSelectedMcpServerId: vi.fn(),
    skillsSearchQuery: '',
    setSkillsSearchQuery: vi.fn(),
    skillsInstalledOnly: false,
    skillsSort: 'name-asc',
    setSkillsSort: vi.fn(),
    selectedSkillId: null,
    setSelectedSkillId: vi.fn(),
  }),
}));

vi.mock('@renderer/utils/projectLookup', () => ({
  resolveProjectPathById: () => null,
}));

vi.mock('@renderer/components/common/ProviderBrandLogo', () => ({
  ProviderBrandLogo: ({ providerId }: { providerId: string }) =>
    React.createElement('span', { 'data-testid': `provider-logo-${providerId}` }, providerId),
}));

vi.mock('@renderer/components/ui/badge', () => ({
  Badge: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children),
}));

vi.mock('@renderer/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) =>
    React.createElement(
      'button',
      {
        type: 'button',
        disabled,
        onClick,
      },
      children
    ),
}));

vi.mock('@renderer/components/ui/tabs', () => ({
  Tabs: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TabsList: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
  TabsContent: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children),
}));

vi.mock('@renderer/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
  Tooltip: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  TooltipTrigger: ({ children }: React.PropsWithChildren) =>
    React.createElement(React.Fragment, null, children),
  TooltipContent: ({ children }: React.PropsWithChildren) => React.createElement('span', null, children),
}));

vi.mock('@renderer/components/extensions/ExtensionsSubTabTrigger', () => ({
  ExtensionsSubTabTrigger: ({ label }: { label: string }) =>
    React.createElement('button', { type: 'button' }, label),
}));

vi.mock('@renderer/components/extensions/plugins/PluginsPanel', () => ({
  PluginsPanel: () => React.createElement('div', null, 'plugins-panel'),
}));

vi.mock('@renderer/components/extensions/mcp/McpServersPanel', () => ({
  McpServersPanel: () => React.createElement('div', null, 'mcp-panel'),
}));

vi.mock('@renderer/components/extensions/skills/SkillsPanel', () => ({
  SkillsPanel: () => React.createElement('div', null, 'skills-panel'),
}));

vi.mock('@renderer/components/extensions/apikeys/ApiKeysPanel', () => ({
  ApiKeysPanel: () => React.createElement('div', null, 'apikeys-panel'),
}));

vi.mock('@renderer/components/extensions/mcp/CustomMcpServerDialog', () => ({
  CustomMcpServerDialog: () => null,
}));

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    AlertTriangle: Icon,
    BookOpen: Icon,
    Info: Icon,
    Key: Icon,
    Loader2: Icon,
    Plus: Icon,
    Puzzle: Icon,
    RefreshCw: Icon,
    Server: Icon,
  };
});

import { ExtensionStoreView } from '@renderer/components/extensions/ExtensionStoreView';

function createLoadingMultimodelStatus(): CliInstallationStatus {
  return {
    flavor: 'agent_teams_orchestrator',
    displayName: 'Multimodel runtime',
    supportsSelfUpdate: false,
    showVersionDetails: false,
    showBinaryPath: false,
    installed: true,
    installedVersion: null,
    binaryPath: '/usr/local/bin/agent-teams',
    launchError: null,
    latestVersion: null,
    updateAvailable: false,
    authLoggedIn: false,
    authStatusChecking: true,
    authMethod: null,
    providers: [
      {
        providerId: 'anthropic',
        displayName: 'Anthropic',
        supported: false,
        authenticated: false,
        authMethod: null,
        verificationState: 'unknown',
        modelVerificationState: 'idle',
        statusMessage: 'Checking...',
        models: [],
        modelAvailability: [],
        canLoginFromUi: true,
        capabilities: {
          teamLaunch: false,
          oneShot: false,
          extensions: {
            plugins: { status: 'supported', ownership: 'shared', reason: null },
            mcp: { status: 'supported', ownership: 'shared', reason: null },
            skills: { status: 'supported', ownership: 'shared', reason: null },
            apiKeys: { status: 'supported', ownership: 'shared', reason: null },
          },
        },
        selectedBackendId: null,
        resolvedBackendId: null,
        availableBackends: [],
        externalRuntimeDiagnostics: [],
        backend: null,
        connection: null,
      },
      {
        providerId: 'codex',
        displayName: 'Codex',
        supported: false,
        authenticated: false,
        authMethod: null,
        verificationState: 'unknown',
        modelVerificationState: 'idle',
        statusMessage: 'Checking...',
        models: [],
        modelAvailability: [],
        canLoginFromUi: true,
        capabilities: {
          teamLaunch: false,
          oneShot: false,
          extensions: {
            plugins: { status: 'unsupported', ownership: 'provider-scoped', reason: null },
            mcp: { status: 'supported', ownership: 'shared', reason: null },
            skills: { status: 'supported', ownership: 'shared', reason: null },
            apiKeys: { status: 'supported', ownership: 'shared', reason: null },
          },
        },
        selectedBackendId: null,
        resolvedBackendId: null,
        availableBackends: [],
        externalRuntimeDiagnostics: [],
        backend: null,
        connection: null,
      },
    ],
  };
}

describe('ExtensionStoreView provider loading placeholders', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    storeState.fetchPluginCatalog = vi.fn().mockResolvedValue(undefined);
    storeState.fetchCliStatus = vi.fn().mockResolvedValue(undefined);
    storeState.fetchApiKeys = vi.fn().mockResolvedValue(undefined);
    storeState.fetchSkillsCatalog = vi.fn().mockResolvedValue(undefined);
    storeState.mcpBrowse = vi.fn().mockResolvedValue(undefined);
    storeState.mcpFetchInstalled = vi.fn().mockResolvedValue(undefined);
    storeState.apiKeysLoading = false;
    storeState.pluginCatalogLoading = false;
    storeState.mcpBrowseLoading = false;
    storeState.skillsLoading = false;
    storeState.cliStatus = createLoadingMultimodelStatus();
    storeState.cliStatusLoading = true;
    storeState.cliProviderStatusLoading = {
      anthropic: true,
      codex: true,
    };
    storeState.openDashboard = vi.fn();
    storeState.sessions = [];
    storeState.projects = [];
    storeState.repositoryGroups = [];
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows multimodel provider skeleton cards while provider status is still loading', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(React.createElement(ExtensionStoreView));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(host.textContent).toContain('Multimodel runtime capabilities');
    expect(host.textContent).toContain('Anthropic');
    expect(host.textContent).toContain('Codex');
    expect(host.textContent).toContain('Checking provider status...');
    expect(host.textContent).toContain('Loading...');
    expect(host.textContent).not.toContain('Checking extensions runtime availability');

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });
  });
});
