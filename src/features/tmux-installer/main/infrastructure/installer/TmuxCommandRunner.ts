import { spawn } from 'node:child_process';

import { killProcessTree } from '@main/utils/childProcess';

import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface TmuxCommandSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
}

interface RunCommandOptions {
  onLine: (line: string) => void;
}

export class TmuxCommandRunner {
  #activeChild: ChildProcessByStdio<null, Readable, Readable> | null = null;

  get activeChild(): ChildProcessByStdio<null, Readable, Readable> | null {
    return this.#activeChild;
  }

  async run(spec: TmuxCommandSpec, options: RunCommandOptions): Promise<{ exitCode: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        env: spec.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.#activeChild = child;

      const createBufferedLineWriter = (): { push: (chunk: string) => void; flush: () => void } => {
        let pending = '';

        const emitLine = (line: string): void => {
          const normalizedLine = line.replace(/\r$/, '');
          if (normalizedLine.trim()) {
            options.onLine(normalizedLine);
          }
        };

        return {
          push: (chunk: string): void => {
            pending += chunk;
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() ?? '';
            for (const line of lines) {
              emitLine(line);
            }
          },
          flush: (): void => {
            if (!pending) {
              return;
            }
            emitLine(pending.trimEnd());
            pending = '';
          },
        };
      };

      const stdoutWriter = createBufferedLineWriter();
      const stderrWriter = createBufferedLineWriter();

      child.stdout.on('data', (chunk: Buffer | string) => stdoutWriter.push(String(chunk)));
      child.stderr.on('data', (chunk: Buffer | string) => stderrWriter.push(String(chunk)));
      child.on('error', (error) => {
        this.#activeChild = null;
        reject(error);
      });
      child.on('close', (exitCode) => {
        stdoutWriter.flush();
        stderrWriter.flush();
        this.#activeChild = null;
        resolve({ exitCode: exitCode ?? 0 });
      });
    });
  }

  cancel(): void {
    killProcessTree(this.#activeChild);
    this.#activeChild = null;
  }
}
