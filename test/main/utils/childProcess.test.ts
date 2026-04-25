// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

// Mock the entire child_process module so that we can inspect how our helpers
// invoke spawn/exec without hitting the real filesystem or spawning anything.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    execFile: vi.fn(),
    exec: vi.fn(),
  };
});

// Import after the mock call so that the mocked module is returned.
import * as child from 'child_process';
import { execCli, killTrackedCliProcesses, spawnCli } from '@main/utils/childProcess';

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void;

// Helper to temporarily override process.platform
function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true,
    writable: true,
  });
}

// restore platform after tests
const originalPlatform = process.platform;

describe('cli child process helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    setPlatform(originalPlatform);
  });

  describe('spawnCli', () => {
    it('calls spawn directly when path is ascii on windows', () => {
      setPlatform('win32');
      (child.spawn as unknown as Mock).mockReturnValue({} as any);

      const result = spawnCli('C:\\bin\\claude.exe', ['--version'], { cwd: 'x' });
      expect(child.spawn).toHaveBeenCalledWith(
        'C:\\bin\\claude.exe',
        ['--version'],
        expect.objectContaining({
          cwd: 'x',
          env: expect.objectContaining({ CLAUDE_HOOK_JUDGE_MODE: 'true' }),
        })
      );
      expect(result).toEqual({} as any);
    });

    it('falls back to shell when spawn throws EINVAL', () => {
      setPlatform('win32');
      const error: any = new Error('spawn EINVAL');
      error.code = 'EINVAL';
      const fake = {} as any;
      const spawnMock = child.spawn as unknown as Mock;
      spawnMock.mockImplementationOnce(() => {
        throw error;
      });
      spawnMock.mockImplementationOnce(() => fake);

      // Use ASCII path so needsShell returns false and we go through the try/catch EINVAL path
      const result = spawnCli('C:\\bin\\claude.exe', ['a', 'b'], {
        env: { FOO: 'bar' },
      });
      expect(spawnMock).toHaveBeenCalledTimes(2);
      const secondArg0 = spawnMock.mock.calls[1][0] as string;
      expect(secondArg0).toMatch(/claude\.exe/);
      expect(spawnMock.mock.calls[1][1]).toMatchObject({ shell: true, env: { FOO: 'bar' } });
      expect(result).toBe(fake);
    });

    it('uses shell directly when path contains non-ASCII on windows', () => {
      setPlatform('win32');
      const fake = {} as any;
      const spawnMock = child.spawn as unknown as Mock;
      spawnMock.mockReturnValue(fake);

      const result = spawnCli('C:\\Users\\Алексей\\AppData\\Roaming\\npm\\claude.cmd', ['a', 'b'], {
        env: { FOO: 'bar' },
      });
      // Non-ASCII detected upfront — single spawn call with shell: true
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const shellCmd = spawnMock.mock.calls[0][0] as string;
      expect(shellCmd).toMatch(/claude\.cmd/);
      expect(spawnMock.mock.calls[0][1]).toMatchObject({ shell: true, env: { FOO: 'bar' } });
      expect(result).toBe(fake);
    });

    it('does not use shell when not on windows', () => {
      setPlatform('linux');
      (child.spawn as unknown as Mock).mockReturnValue({} as any);
      const result = spawnCli('/usr/bin/claude', ['--help']);
      expect(child.spawn).toHaveBeenCalledWith(
        '/usr/bin/claude',
        ['--help'],
        expect.objectContaining({
          env: expect.objectContaining({ CLAUDE_HOOK_JUDGE_MODE: 'true' }),
        })
      );
      expect(result).toEqual({} as any);
    });

    it('kills tracked CLI processes on shutdown', () => {
      setPlatform('linux');
      const fakeChild = {
        pid: 123,
        kill: vi.fn(),
        once: vi.fn(function once() {
          return fakeChild;
        }),
      };
      (child.spawn as unknown as Mock).mockReturnValue(fakeChild);

      spawnCli('/usr/bin/claude', ['--version']);
      killTrackedCliProcesses('SIGTERM');

      expect(fakeChild.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('untracks CLI processes after close', () => {
      setPlatform('linux');
      const registeredHandlers = new Map<string, () => void>();
      const fakeChild = {
        pid: 456,
        kill: vi.fn(),
        once: vi.fn(function once(event: string, handler: () => void) {
          registeredHandlers.set(event, handler);
          return fakeChild;
        }),
      };
      (child.spawn as unknown as Mock).mockReturnValue(fakeChild);

      spawnCli('/usr/bin/claude', ['--version']);
      registeredHandlers.get('close')?.();
      killTrackedCliProcesses('SIGTERM');

      expect(fakeChild.kill).not.toHaveBeenCalled();
    });
  });

  describe('execCli', () => {
    it('invokes execFile when path is ASCII on windows', async () => {
      setPlatform('win32');
      const execFileMock = child.execFile as unknown as Mock;
      execFileMock.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
          cb(null, 'ok', '');
          return {} as any;
        }
      );
      const result = await execCli('C:\\bin\\claude.exe', ['--version']);
      expect(execFileMock).toHaveBeenCalledWith(
        'C:\\bin\\claude.exe',
        ['--version'],
        expect.objectContaining({
          env: expect.objectContaining({ CLAUDE_HOOK_JUDGE_MODE: 'true' }),
        }),
        expect.any(Function)
      );
      expect(result.stdout).toBe('ok');
    });

    it('skips straight to shell when path contains non-ASCII on windows', async () => {
      setPlatform('win32');
      const execFileMock = child.execFile as unknown as Mock;
      const execMock = child.exec as unknown as Mock;
      execMock.mockImplementation((_cmd: string, _opts: unknown, cb: ExecCallback) => {
        cb(null, '1.2.3', '');
        return {} as any;
      });

      const result = await execCli('C:\\Users\\Алексей\\AppData\\Roaming\\npm\\claude.cmd', [
        '--version',
      ]);
      // non-ASCII path detected upfront — execFile should NOT be called
      expect(execFileMock).not.toHaveBeenCalled();
      expect(execMock).toHaveBeenCalled();
      expect(result.stdout).toBe('1.2.3');
    });

    it('escapes percent signs and quotes for cmd.exe in shell fallback', async () => {
      setPlatform('win32');
      const execMock = child.exec as unknown as Mock;
      execMock.mockImplementation((_cmd: string, _opts: unknown, cb: ExecCallback) => {
        cb(null, 'ok', '');
        return {} as any;
      });

      await execCli('C:\\Users\\Алексей\\bin\\claude.cmd', ['--model', 'test%PATH%"arg']);
      const shellCmd = execMock.mock.calls[0][0] as string;
      // %PATH% must become %%PATH%% to prevent cmd.exe env var expansion
      expect(shellCmd).toContain('%%PATH%%');
      // double quote inside arg must become "" (cmd.exe escaping)
      expect(shellCmd).toContain('""arg');
      // should NOT contain \" (Unix-style escaping)
      expect(shellCmd).not.toContain('\\"');
    });

    it('shell: true cannot be overridden by caller options', () => {
      setPlatform('win32');
      const spawnMock = child.spawn as unknown as Mock;
      spawnMock.mockReturnValue({} as any);

      spawnCli('C:\\Users\\Алексей\\bin\\claude.cmd', ['--version'], { shell: false } as any);
      // shell: true must win over caller's shell: false
      expect(spawnMock.mock.calls[0][1]).toMatchObject({ shell: true });
    });

    it('falls back to shell when execFile throws EINVAL on windows', async () => {
      setPlatform('win32');
      const execFileMock = child.execFile as unknown as Mock;
      execFileMock.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
          const err = new Error('spawn EINVAL') as Error & { code?: string };
          err.code = 'EINVAL';
          cb(err, '', '');
          return {} as any;
        }
      );
      const execMock = child.exec as unknown as Mock;
      execMock.mockImplementation((_cmd: string, _opts: unknown, cb: ExecCallback) => {
        cb(null, '2.3.4', '');
        return {} as any;
      });

      // ASCII path — goes through execFile first, gets EINVAL, falls back to shell
      const result = await execCli('C:\\bin\\claude.exe', ['--version']);
      expect(execFileMock).toHaveBeenCalled();
      expect(execMock).toHaveBeenCalled();
      expect(result.stdout).toBe('2.3.4');
    });

    it('preserves stdout and stderr on execFile failures', async () => {
      setPlatform('linux');
      const execFileMock = child.execFile as unknown as Mock;
      execFileMock.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: ExecCallback) => {
          cb(new Error('Command failed'), '{"error":"bad"}', 'bun: not found');
          return {} as any;
        }
      );

      await expect(execCli('/usr/bin/claude', ['--version'])).rejects.toMatchObject({
        message: 'Command failed',
        stdout: '{"error":"bad"}',
        stderr: 'bun: not found',
      });
    });
  });
});
