import { execFile, execFileSync } from 'node:child_process';

import { buildEnrichedEnv } from '@main/utils/cliEnv';
import { resolveInteractiveShellEnv } from '@main/utils/shellEnv';

import { TmuxPackageManagerResolver } from '../platform/TmuxPackageManagerResolver';
import { TmuxWslService } from '../wsl/TmuxWslService';

interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class TmuxPlatformCommandExecutor {
  readonly #wslService: TmuxWslService;
  readonly #packageManagerResolver: TmuxPackageManagerResolver;

  constructor(
    wslService = new TmuxWslService(),
    packageManagerResolver = new TmuxPackageManagerResolver()
  ) {
    this.#wslService = wslService;
    this.#packageManagerResolver = packageManagerResolver;
  }

  async execTmux(args: string[], timeout = 5_000): Promise<ExecResult> {
    if (process.platform === 'win32') {
      return this.#wslService.execTmux(args, null, timeout);
    }

    await resolveInteractiveShellEnv();
    const env = buildEnrichedEnv();
    const executable = await this.#resolveNativeTmuxExecutable(env);
    return new Promise((resolve) => {
      execFile(executable, args, { env, timeout }, (error, stdout, stderr) => {
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as NodeJS.ErrnoException).code
            : undefined;
        resolve({
          exitCode: typeof errorCode === 'number' ? errorCode : error ? 1 : 0,
          stdout: String(stdout),
          stderr: String(stderr) || (error instanceof Error ? error.message : ''),
        });
      });
    });
  }

  async killPane(paneId: string): Promise<void> {
    const result = await this.execTmux(['kill-pane', '-t', paneId], 3_000);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Failed to kill tmux pane ${paneId}`);
    }
  }

  async listPanePids(paneIds: readonly string[]): Promise<Map<string, number>> {
    const normalizedPaneIds = [...new Set(paneIds.map((paneId) => paneId.trim()).filter(Boolean))];
    if (normalizedPaneIds.length === 0) {
      return new Map();
    }

    const result = await this.execTmux(
      ['list-panes', '-a', '-F', '#{pane_id}\t#{pane_pid}'],
      3_000
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Failed to list tmux panes');
    }

    const wanted = new Set(normalizedPaneIds);
    const panePidById = new Map<string, number>();
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const [paneId = '', rawPid = ''] = trimmed.split('\t');
      const normalizedPaneId = paneId.trim();
      if (!wanted.has(normalizedPaneId)) continue;
      const pid = Number.parseInt(rawPid.trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        panePidById.set(normalizedPaneId, pid);
      }
    }
    return panePidById;
  }

  killPaneSync(paneId: string): void {
    if (process.platform === 'win32') {
      const preferredDistro = this.#wslService.getPersistedPreferredDistroSync();
      const candidates = this.#getWslExecutableCandidates();
      let lastError: Error | null = null;
      const distroAttempts = preferredDistro ? [preferredDistro, null] : [null];
      for (const distroName of distroAttempts) {
        for (const executable of candidates) {
          try {
            execFileSync(
              executable,
              [...(distroName ? ['-d', distroName] : []), '-e', 'tmux', 'kill-pane', '-t', paneId],
              {
                stdio: 'ignore',
                windowsHide: true,
              }
            );
            return;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
          }
        }
      }
      throw lastError ?? new Error(`Failed to kill tmux pane ${paneId}`);
    }

    // eslint-disable-next-line sonarjs/no-os-command-from-path -- tmux is resolved during runtime readiness checks before this sync cleanup path is used
    execFileSync('tmux', ['kill-pane', '-t', paneId], { stdio: 'ignore' });
  }

  #getWslExecutableCandidates(): string[] {
    const candidates = new Set<string>();
    const windir = process.env.WINDIR;
    if (windir) {
      candidates.add(`${windir}\\System32\\wsl.exe`);
      candidates.add(`${windir}\\Sysnative\\wsl.exe`);
    }
    candidates.add('wsl.exe');
    return [...candidates];
  }

  async #resolveNativeTmuxExecutable(env: NodeJS.ProcessEnv): Promise<string> {
    const platform =
      process.platform === 'darwin' || process.platform === 'linux' || process.platform === 'win32'
        ? process.platform
        : 'unknown';
    const executable = await this.#packageManagerResolver.resolveTmuxBinary(env, platform);
    if (!executable) {
      throw new Error('tmux executable could not be resolved for the current platform.');
    }
    return executable;
  }
}
