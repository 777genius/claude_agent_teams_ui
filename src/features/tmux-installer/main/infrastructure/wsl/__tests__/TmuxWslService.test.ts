import { describe, expect, it } from 'vitest';

import { TmuxWslService } from '../TmuxWslService';

function createPreferenceStore(initialPreferredDistro: string | null = null): {
  getPreferredDistro: () => Promise<string | null>;
  getPreferredDistroSync: () => string | null;
  setPreferredDistro: (preferredDistroName: string) => Promise<void>;
  clearPreferredDistro: () => Promise<void>;
} {
  let preferredDistro = initialPreferredDistro;
  return {
    async getPreferredDistro() {
      return preferredDistro;
    },
    getPreferredDistroSync() {
      return preferredDistro;
    },
    async setPreferredDistro(nextPreferredDistroName: string) {
      preferredDistro = nextPreferredDistroName;
    },
    async clearPreferredDistro() {
      preferredDistro = null;
    },
  };
}

function createExecFileMock(
  handlers: Record<
    string,
    { error?: NodeJS.ErrnoException | null; stdout?: string | Buffer; stderr?: string | Buffer }
  >
): (
  command: string,
  args: string[],
  options: {
    timeout: number;
    windowsHide: boolean;
    maxBuffer: number;
    encoding: 'buffer';
  },
  callback: (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void
) => void {
  return (_command, args, _options, callback) => {
    const key = args.join(' ');
    const result = handlers[key];
    if (!result) {
      const error = new Error(`Unexpected WSL command: ${key}`) as NodeJS.ErrnoException;
      error.code = 'EFAIL';
      callback(error, '', '');
      return;
    }
    callback(result.error ?? null, result.stdout ?? '', result.stderr ?? '');
  };
}

describe('TmuxWslService', () => {
  it('reports missing WSL when status and list commands both fail', async () => {
    const service = new TmuxWslService(
      createExecFileMock({
        '--status': {
          error: Object.assign(new Error('wsl missing'), { code: 'EFAIL' }),
          stderr: 'WSL is not installed',
        },
        '--list --quiet': {
          error: Object.assign(new Error('wsl missing'), { code: 'EFAIL' }),
          stderr: 'WSL is not installed',
        },
      }),
      createPreferenceStore() as never
    );

    const result = await service.probe();

    expect(result.status.wslInstalled).toBe(false);
    expect(result.status.statusDetail).toContain('WSL');
    expect(result.preference).toBeNull();
  });

  it('detects a bootstrapped Ubuntu distro with tmux available', async () => {
    const service = new TmuxWslService(
      createExecFileMock({
        '--status': { stdout: 'Default Distribution: Ubuntu\nDefault Version: 2\n' },
        '--list --quiet': { stdout: 'Ubuntu\n' },
        '--list --verbose': { stdout: '* Ubuntu    Running    2\n' },
        '-d Ubuntu -- sh -lc printf ready': { stdout: 'ready' },
        '-d Ubuntu -- sh -lc . /etc/os-release >/dev/null 2>&1 && printf %s "$ID"': {
          stdout: 'ubuntu',
        },
        '-d Ubuntu -- sh -lc command -v tmux >/dev/null 2>&1 && { tmux -V; printf "\\n"; command -v tmux; }':
          {
            stdout: 'tmux 3.4\n/usr/bin/tmux\n',
          },
      }),
      createPreferenceStore() as never
    );

    const result = await service.probe();

    expect(result.preference?.preferredDistroName).toBe('Ubuntu');
    expect(result.status.wslInstalled).toBe(true);
    expect(result.status.distroName).toBe('Ubuntu');
    expect(result.status.distroVersion).toBe(2);
    expect(result.status.distroBootstrapped).toBe(true);
    expect(result.status.innerPackageManager).toBe('apt');
    expect(result.status.tmuxAvailableInsideWsl).toBe(true);
    expect(result.status.tmuxVersion).toBe('tmux 3.4');
    expect(result.status.tmuxBinaryPath).toBe('/usr/bin/tmux');
  });

  it('prefers the persisted distro over the default WSL marker', async () => {
    const service = new TmuxWslService(
      createExecFileMock({
        '--status': { stdout: 'Default Distribution: Debian\nDefault Version: 2\n' },
        '--list --quiet': { stdout: 'Ubuntu\nDebian\n' },
        '--list --verbose': { stdout: '* Debian    Running    2\n  Ubuntu    Stopped    2\n' },
        '-d Ubuntu -- sh -lc printf ready': { stdout: 'ready' },
        '-d Ubuntu -- sh -lc . /etc/os-release >/dev/null 2>&1 && printf %s "$ID"': {
          stdout: 'ubuntu',
        },
        '-d Ubuntu -- sh -lc command -v tmux >/dev/null 2>&1 && { tmux -V; printf "\\n"; command -v tmux; }':
          {
            stdout: 'tmux 3.4\n/usr/bin/tmux\n',
          },
      }),
      createPreferenceStore('Ubuntu') as never
    );

    const result = await service.probe();

    expect(result.preference?.preferredDistroName).toBe('Ubuntu');
    expect(result.preference?.source).toBe('persisted');
    expect(result.status.distroName).toBe('Ubuntu');
  });

  it('clears a stale preferred distro when WSL has no installed distributions', async () => {
    const preferenceStore = createPreferenceStore('Ubuntu');
    const service = new TmuxWslService(
      createExecFileMock({
        '--status': { stdout: 'Default Version: 2\n' },
        '--list --quiet': { stdout: '' },
      }),
      preferenceStore as never
    );

    const result = await service.probe();

    expect(result.status.distroName).toBeNull();
    expect(preferenceStore.getPreferredDistroSync()).toBeNull();
  });

  it('switches preference source away from persisted after clearing a stale distro', async () => {
    const preferenceStore = createPreferenceStore('Ubuntu');
    const service = new TmuxWslService(
      createExecFileMock({
        '--status': { stdout: 'Default Distribution: Debian\nDefault Version: 2\n' },
        '--list --quiet': { stdout: 'Debian\n' },
        '--list --verbose': { stdout: '* Debian    Running    2\n' },
        '-d Debian -- sh -lc printf ready': { stdout: 'ready' },
        '-d Debian -- sh -lc . /etc/os-release >/dev/null 2>&1 && printf %s "$ID"': {
          stdout: 'debian',
        },
        '-d Debian -- sh -lc command -v tmux >/dev/null 2>&1 && { tmux -V; printf "\\n"; command -v tmux; }':
          {
            stdout: 'tmux 3.4\n/usr/bin/tmux\n',
          },
      }),
      preferenceStore as never
    );

    const result = await service.probe();

    expect(result.preference?.preferredDistroName).toBe('Debian');
    expect(result.preference?.source).toBe('default');
    expect(preferenceStore.getPreferredDistroSync()).toBeNull();
  });
});
