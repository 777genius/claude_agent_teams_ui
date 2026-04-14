import { describe, expect, it, vi } from 'vitest';

import { TmuxInstallerRunnerAdapter } from '../TmuxInstallerRunnerAdapter';

import type { TmuxInstallerSnapshot, TmuxStatus } from '@features/tmux-installer/contracts';

const CHECKED_AT = new Date().toISOString();

function createBaseStatus(overrides: Partial<TmuxStatus> = {}): TmuxStatus {
  return {
    platform: 'linux',
    nativeSupported: true,
    checkedAt: CHECKED_AT,
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
      detail: 'tmux is not installed yet.',
    },
    error: null,
    autoInstall: {
      supported: true,
      strategy: 'apt',
      packageManagerLabel: 'APT',
      requiresTerminalInput: false,
      requiresAdmin: true,
      requiresRestart: false,
      mayOpenExternalWindow: false,
      reasonIfUnsupported: null,
      manualHints: [],
    },
    ...overrides,
  };
}

function createPresenter(): { present: ReturnType<typeof vi.fn> } {
  return {
    present: vi.fn(),
  };
}

async function waitForSnapshot(
  readSnapshot: () => TmuxInstallerSnapshot,
  predicate: (snapshot: TmuxInstallerSnapshot) => boolean
): Promise<TmuxInstallerSnapshot> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const snapshot = readSnapshot();
    if (predicate(snapshot)) {
      return snapshot;
    }
    await Promise.resolve();
  }

  return readSnapshot();
}

describe('TmuxInstallerRunnerAdapter', () => {
  it('clears stale logs when a later install call exits early as already ready', async () => {
    const presenter = createPresenter();
    const initialStatus = createBaseStatus();
    const readyStatus = createBaseStatus({
      host: {
        available: true,
        version: 'tmux 3.4',
        binaryPath: '/usr/bin/tmux',
        error: null,
      },
      effective: {
        available: true,
        location: 'host',
        version: 'tmux 3.4',
        binaryPath: '/usr/bin/tmux',
        runtimeReady: true,
        detail: 'tmux is available for the persistent teammate runtime.',
      },
    });
    let statusCallCount = 0;
    const statusSource = {
      getStatus: vi.fn(async () => {
        statusCallCount += 1;
        return statusCallCount === 1 ? initialStatus : readyStatus;
      }),
      invalidateStatus: vi.fn(),
    };
    const commandRunner = {
      run: vi.fn(async (_spec, options: { onLine: (line: string) => void }) => {
        options.onLine('apt-get could not find tmux');
        return { exitCode: 1 };
      }),
      cancel: vi.fn(),
    };
    const runner = new TmuxInstallerRunnerAdapter(
      statusSource as never,
      presenter as never,
      {
        resolve: vi.fn(async () => ({
          capability: initialStatus.autoInstall,
          command: {
            command: 'sudo',
            args: ['-n', 'apt-get', 'install', '-y', 'tmux'],
            env: process.env,
            cwd: process.cwd(),
            requiresPty: false,
            displayCommand: 'sudo -n apt-get install -y tmux',
          },
          retryWithUpdateCommand: null,
        })),
      } as never,
      commandRunner as never
    );

    await expect(runner.install()).rejects.toThrow('tmux install command failed');
    expect(runner.getSnapshot().logs).toContain('apt-get could not find tmux');

    await expect(runner.install()).resolves.toBeUndefined();

    const snapshot = runner.getSnapshot();
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.logs).toEqual([]);
  });

  it('preserves leading and trailing spaces when sending installer input', async () => {
    const presenter = createPresenter();
    const initialStatus = createBaseStatus();
    const verifiedStatus = createBaseStatus({
      host: {
        available: true,
        version: 'tmux 3.4',
        binaryPath: '/usr/bin/tmux',
        error: null,
      },
      effective: {
        available: true,
        location: 'host',
        version: 'tmux 3.4',
        binaryPath: '/usr/bin/tmux',
        runtimeReady: true,
        detail: 'tmux is available for the persistent teammate runtime.',
      },
    });
    let statusCallCount = 0;
    const statusSource = {
      getStatus: vi.fn(async () => {
        statusCallCount += 1;
        return statusCallCount === 1 ? initialStatus : verifiedStatus;
      }),
      invalidateStatus: vi.fn(),
    };
    const strategyResolver = {
      resolve: vi.fn(async () => ({
        capability: initialStatus.autoInstall,
        command: {
          command: 'sudo',
          args: ['apt-get', 'install', '-y', 'tmux'],
          env: process.env,
          cwd: process.cwd(),
          requiresPty: true,
          displayCommand: 'sudo apt-get install -y tmux',
        },
        retryWithUpdateCommand: null,
      })),
    };
    let resolveTerminalRun: ((result: { exitCode: number }) => void) | null = null;
    const terminalSession = {
      run: vi.fn(
        () =>
          new Promise<{ exitCode: number }>((resolve) => {
            resolveTerminalRun = resolve;
          })
      ),
      writeLine: vi.fn((input: string) => {
        resolveTerminalRun?.({ exitCode: 0 });
        return input;
      }),
      cancel: vi.fn(),
    };
    const runner = new TmuxInstallerRunnerAdapter(
      statusSource as never,
      presenter as never,
      strategyResolver as never,
      { run: vi.fn(), cancel: vi.fn() } as never,
      terminalSession as never
    );

    const installPromise = runner.install();
    await Promise.resolve();
    await Promise.resolve();

    expect(runner.getSnapshot().acceptsInput).toBe(true);

    await runner.submitInput('  secret with spaces  ');
    await expect(installPromise).resolves.toBeUndefined();

    expect(terminalSession.writeLine).toHaveBeenCalledWith('  secret with spaces  ');
  });

  it('keeps cancelled installs in cancelled state instead of overwriting them with error', async () => {
    const presenter = createPresenter();
    const statusSource = {
      getStatus: vi.fn(async () => createBaseStatus()),
      invalidateStatus: vi.fn(),
    };
    let resolveCommandRun: ((result: { exitCode: number }) => void) | null = null;
    const commandRunner = {
      run: vi.fn(
        () =>
          new Promise<{ exitCode: number }>((resolve) => {
            resolveCommandRun = resolve;
          })
      ),
      cancel: vi.fn(),
    };
    const runner = new TmuxInstallerRunnerAdapter(
      statusSource as never,
      presenter as never,
      {
        resolve: vi.fn(async () => ({
          capability: createBaseStatus().autoInstall,
          command: {
            command: 'sudo',
            args: ['-n', 'apt-get', 'install', '-y', 'tmux'],
            env: process.env,
            cwd: process.cwd(),
            requiresPty: false,
            displayCommand: 'sudo -n apt-get install -y tmux',
          },
          retryWithUpdateCommand: null,
        })),
      } as never,
      commandRunner as never
    );

    const installPromise = runner.install();
    await waitForSnapshot(
      () => runner.getSnapshot(),
      (snapshot) => snapshot.canCancel
    );
    await runner.cancel();
    resolveCommandRun?.({ exitCode: 1 });

    await expect(installPromise).resolves.toBeUndefined();

    expect(commandRunner.cancel).toHaveBeenCalledOnce();
    expect(runner.getSnapshot().phase).toBe('cancelled');
  });

  it('pins Ubuntu as the preferred distro before re-checking after WSL distro install', async () => {
    const presenter = createPresenter();
    let preferredDistroName: string | null = null;
    let statusCallCount = 0;
    const initialStatus = createBaseStatus({
      platform: 'win32',
      nativeSupported: false,
      autoInstall: {
        supported: true,
        strategy: 'wsl',
        packageManagerLabel: 'WSL',
        requiresTerminalInput: false,
        requiresAdmin: false,
        requiresRestart: false,
        mayOpenExternalWindow: true,
        reasonIfUnsupported: null,
        manualHints: [],
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
        statusDetail: 'No distro is configured yet.',
      },
      wslPreference: null,
    });
    const statusSource = {
      getStatus: vi.fn(async () => {
        statusCallCount += 1;
        if (statusCallCount === 1) {
          return initialStatus;
        }

        return createBaseStatus({
          platform: 'win32',
          nativeSupported: false,
          autoInstall: initialStatus.autoInstall,
          effective: {
            available: false,
            location: null,
            version: null,
            binaryPath: null,
            runtimeReady: false,
            detail:
              preferredDistroName === 'Ubuntu'
                ? 'Ubuntu still needs its first Linux user setup.'
                : 'Debian still needs its first Linux user setup.',
          },
          wsl: {
            wslInstalled: true,
            rebootRequired: false,
            distroName: preferredDistroName === 'Ubuntu' ? 'Ubuntu' : 'Debian',
            distroVersion: 2,
            distroBootstrapped: false,
            innerPackageManager: null,
            tmuxAvailableInsideWsl: false,
            tmuxVersion: null,
            tmuxBinaryPath: null,
            statusDetail:
              preferredDistroName === 'Ubuntu'
                ? 'Ubuntu still needs its first Linux user setup.'
                : 'Debian still needs its first Linux user setup.',
          },
          wslPreference: preferredDistroName
            ? {
                preferredDistroName,
                source: 'persisted',
              }
            : null,
        });
      }),
      invalidateStatus: vi.fn(),
    };
    const commandRunner = {
      run: vi.fn(async () => ({ exitCode: 0 })),
      cancel: vi.fn(),
    };
    const wslService = {
      persistPreferredDistro: vi.fn(async (nextPreferredDistroName: string | null) => {
        preferredDistroName = nextPreferredDistroName;
      }),
    };
    const runner = new TmuxInstallerRunnerAdapter(
      statusSource as never,
      presenter as never,
      {
        resolve: vi.fn(async () => {
          throw new Error('resolve() should not be reached before distro bootstrap completes');
        }),
      } as never,
      commandRunner as never,
      {
        run: vi.fn(),
        writeLine: vi.fn(),
        cancel: vi.fn(),
      } as never,
      wslService as never,
      {
        runWslCoreInstall: vi.fn(),
      } as never
    );

    await expect(runner.install()).resolves.toBeUndefined();

    expect(wslService.persistPreferredDistro).toHaveBeenCalledWith('Ubuntu');
    expect(runner.getSnapshot().phase).toBe('waiting_for_external_step');
    expect(runner.getSnapshot().message).toContain('Ubuntu');
  });
});
