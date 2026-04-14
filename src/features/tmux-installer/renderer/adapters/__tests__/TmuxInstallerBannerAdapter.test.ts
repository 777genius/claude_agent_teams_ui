import { describe, expect, it } from 'vitest';

import { TmuxInstallerBannerAdapter } from '../TmuxInstallerBannerAdapter';

import type { TmuxInstallerSnapshot, TmuxStatus } from '@features/tmux-installer/contracts';

const baseStatus: TmuxStatus = {
  platform: 'darwin',
  nativeSupported: true,
  checkedAt: new Date().toISOString(),
  host: {
    available: false,
    version: null,
    binaryPath: null,
    error: null,
  },
  effective: {
    available: false,
    location: null,
    version: null,
    binaryPath: null,
    runtimeReady: false,
    detail: 'tmux improves persistent teammate reliability.',
  },
  error: null,
  autoInstall: {
    supported: true,
    strategy: 'homebrew',
    packageManagerLabel: 'Homebrew',
    requiresTerminalInput: false,
    requiresAdmin: false,
    requiresRestart: false,
    mayOpenExternalWindow: false,
    reasonIfUnsupported: null,
    manualHints: [{ title: 'Homebrew', description: 'Recommended', command: 'brew install tmux' }],
  },
};

const idleSnapshot: TmuxInstallerSnapshot = {
  phase: 'idle',
  strategy: null,
  message: null,
  detail: null,
  error: null,
  canCancel: false,
  acceptsInput: false,
  inputPrompt: null,
  inputSecret: false,
  logs: [],
  updatedAt: new Date().toISOString(),
};

describe('TmuxInstallerBannerAdapter', () => {
  it('builds an install-ready view model for unavailable tmux', () => {
    const adapter = TmuxInstallerBannerAdapter.create();

    const result = adapter.adapt({
      status: baseStatus,
      snapshot: idleSnapshot,
      loading: false,
      error: null,
      detailsOpen: false,
    });

    expect(result.visible).toBe(true);
    expect(result.installSupported).toBe(true);
    expect(result.installDisabled).toBe(false);
    expect(result.installLabel).toBe('Install tmux');
    expect(result.platformLabel).toBe('macOS');
    expect(result.runtimeReadyLabel).toBeNull();
    expect(result.primaryGuideUrl).toBeNull();
    expect(result.progressPercent).toBeNull();
    expect(result.manualHints).toHaveLength(1);
    expect(result.body).toContain('persistent teammate reliability');
  });

  it('prioritizes renderer errors and disables the install button while installing', () => {
    const adapter = TmuxInstallerBannerAdapter.create();

    const result = adapter.adapt({
      status: baseStatus,
      snapshot: {
        ...idleSnapshot,
        phase: 'installing',
        strategy: 'homebrew',
        message: 'brew install tmux',
        canCancel: true,
        acceptsInput: false,
        inputPrompt: null,
        inputSecret: false,
        logs: ['Downloading bottle...'],
      },
      loading: false,
      error: 'Renderer bridge failed',
      detailsOpen: true,
    });

    expect(result.title).toBe('Installing tmux');
    expect(result.body).toBe('Renderer bridge failed');
    expect(result.error).toBe('Renderer bridge failed');
    expect(result.installDisabled).toBe(true);
    expect(result.canCancel).toBe(true);
    expect(result.acceptsInput).toBe(false);
    expect(result.progressPercent).toBe(68);
    expect(result.logs).toEqual(['Downloading bottle...']);
  });

  it('exposes a manual guide url when auto install is unavailable', () => {
    const adapter = TmuxInstallerBannerAdapter.create();

    const result = adapter.adapt({
      status: {
        ...baseStatus,
        platform: 'win32',
        effective: {
          ...baseStatus.effective,
          detail: 'WSL is installed, but tmux still needs to be installed there.',
        },
        autoInstall: {
          ...baseStatus.autoInstall,
          supported: false,
          strategy: 'wsl',
          manualHints: [
            {
              title: 'Microsoft WSL',
              description: 'Official WSL docs',
              url: 'https://learn.microsoft.com/en-us/windows/wsl/install',
            },
          ],
        },
      },
      snapshot: {
        ...idleSnapshot,
        phase: 'needs_manual_step',
        strategy: 'wsl',
        detail: 'WSL wizard is not wired yet.',
      },
      loading: false,
      error: null,
      detailsOpen: false,
    });

    expect(result.platformLabel).toBe('Windows');
    expect(result.primaryGuideUrl).toBe('https://learn.microsoft.com/en-us/windows/wsl/install');
    expect(result.progressPercent).toBe(100);
  });

  it('keeps the banner visible when tmux is installed but runtime is not ready yet', () => {
    const adapter = TmuxInstallerBannerAdapter.create();

    const result = adapter.adapt({
      status: {
        ...baseStatus,
        platform: 'win32',
        effective: {
          available: true,
          location: 'host',
          version: 'tmux 3.4',
          binaryPath: 'C:\\tmux.exe',
          runtimeReady: false,
          detail: 'tmux was found on Windows, but WSL-backed tmux is still preferred.',
        },
      },
      snapshot: idleSnapshot,
      loading: false,
      error: null,
      detailsOpen: false,
    });

    expect(result.visible).toBe(true);
    expect(result.title).toBe('tmux needs one more step');
    expect(result.locationLabel).toBe('Host runtime');
    expect(result.runtimeReadyLabel).toBe('Installed, but not active yet');
    expect(result.versionLabel).toBe('tmux 3.4');
  });

  it('exposes installer input metadata for interactive privilege flows', () => {
    const adapter = TmuxInstallerBannerAdapter.create();

    const result = adapter.adapt({
      status: baseStatus,
      snapshot: {
        ...idleSnapshot,
        phase: 'requesting_privileges',
        strategy: 'apt',
        acceptsInput: true,
        inputPrompt: 'Enter password if prompted',
        inputSecret: true,
      },
      loading: false,
      error: null,
      detailsOpen: false,
    });

    expect(result.acceptsInput).toBe(true);
    expect(result.inputPrompt).toBe('Enter password if prompted');
    expect(result.inputSecret).toBe(true);
  });

  it('uses Windows-specific install labels for the WSL wizard states', () => {
    const adapter = TmuxInstallerBannerAdapter.create();

    const installWslResult = adapter.adapt({
      status: {
        ...baseStatus,
        platform: 'win32',
        autoInstall: {
          ...baseStatus.autoInstall,
          supported: true,
          strategy: 'wsl',
        },
        wsl: {
          wslInstalled: false,
          rebootRequired: false,
          distroName: null,
          distroVersion: null,
          distroBootstrapped: false,
          innerPackageManager: null,
          tmuxAvailableInsideWsl: false,
          tmuxVersion: null,
          tmuxBinaryPath: null,
          statusDetail: 'WSL is not installed yet.',
        },
      },
      snapshot: idleSnapshot,
      loading: false,
      error: null,
      detailsOpen: false,
    });
    const installUbuntuResult = adapter.adapt({
      status: {
        ...baseStatus,
        platform: 'win32',
        autoInstall: {
          ...baseStatus.autoInstall,
          supported: true,
          strategy: 'wsl',
        },
        wsl: {
          wslInstalled: true,
          rebootRequired: false,
          distroName: null,
          distroVersion: null,
          distroBootstrapped: false,
          innerPackageManager: null,
          tmuxAvailableInsideWsl: false,
          tmuxVersion: null,
          tmuxBinaryPath: null,
          statusDetail: 'No distro yet.',
        },
      },
      snapshot: idleSnapshot,
      loading: false,
      error: null,
      detailsOpen: false,
    });

    expect(installWslResult.installLabel).toBe('Install WSL');
    expect(installUbuntuResult.installLabel).toBe('Install Ubuntu in WSL');
  });
});
