import { once } from 'node:events';
import readline from 'node:readline';

import { killProcessTree, spawnCli } from '@main/utils/childProcess';

import type { LoggerPort } from '../../../core/application/ports/LoggerPort';

const DEFAULT_REQUEST_TIMEOUT_MS = 3_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 8_000;

interface JsonRpcErrorPayload {
  code?: number;
  message?: string;
}

interface JsonRpcResponse<T> {
  id?: number;
  result?: T;
  error?: JsonRpcErrorPayload;
}

export interface JsonRpcSession {
  request<TResult>(method: string, params?: unknown, timeoutMs?: number): Promise<TResult>;
  notify(method: string, params?: unknown): Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }) as Promise<T>;
}

export class JsonRpcStdioClient {
  constructor(private readonly logger: LoggerPort) {}

  async withSession<T>(
    options: {
      binaryPath: string;
      args: string[];
      requestTimeoutMs?: number;
      totalTimeoutMs?: number;
      label: string;
    },
    handler: (session: JsonRpcSession) => Promise<T>
  ): Promise<T> {
    const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

    return withTimeout(
      this.#runSession(options.binaryPath, options.args, requestTimeoutMs, handler),
      totalTimeoutMs,
      options.label
    );
  }

  async #runSession<T>(
    binaryPath: string,
    args: string[],
    requestTimeoutMs: number,
    handler: (session: JsonRpcSession) => Promise<T>
  ): Promise<T> {
    const child = spawnCli(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const lineReader = readline.createInterface({ input: child.stdout! });
    child.stderr?.on('data', () => {
      // Keep stderr drained so process warnings do not block the pipe.
    });

    const pending = new Map<
      number,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timeoutId: ReturnType<typeof setTimeout>;
      }
    >();

    let nextRequestId = 1;

    const rejectAll = (error: Error): void => {
      for (const [id, entry] of pending) {
        clearTimeout(entry.timeoutId);
        entry.reject(error);
        pending.delete(id);
      }
    };

    lineReader.on('line', (line) => {
      let message: JsonRpcResponse<unknown>;
      try {
        message = JSON.parse(line) as JsonRpcResponse<unknown>;
      } catch (error) {
        this.logger.warn('json-rpc stdio emitted non-json line', {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      if (typeof message.id !== 'number') {
        return;
      }

      const entry = pending.get(message.id);
      if (!entry) {
        return;
      }

      clearTimeout(entry.timeoutId);
      pending.delete(message.id);

      if (message.error) {
        entry.reject(new Error(message.error.message ?? 'Unknown JSON-RPC error'));
        return;
      }

      entry.resolve(message.result);
    });

    child.once('error', (error) => {
      rejectAll(error instanceof Error ? error : new Error(String(error)));
    });

    child.once('exit', (code, signal) => {
      if (pending.size === 0) {
        return;
      }

      rejectAll(
        new Error(
          `JSON-RPC process exited unexpectedly (code=${code ?? 'null'} signal=${signal ?? 'null'})`
        )
      );
    });

    const session: JsonRpcSession = {
      request: <TResult>(
        method: string,
        params?: unknown,
        timeoutMs = requestTimeoutMs
      ): Promise<TResult> =>
        new Promise<TResult>((resolve, reject) => {
          if (!child.stdin) {
            reject(new Error('JSON-RPC stdin is not available'));
            return;
          }

          const id = nextRequestId++;
          const timeoutId = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`JSON-RPC request timed out: ${method}`));
          }, timeoutMs);

          pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timeoutId });

          child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
            if (!error) {
              return;
            }

            clearTimeout(timeoutId);
            pending.delete(id);
            reject(error instanceof Error ? error : new Error(String(error)));
          });
        }),

      notify: async (method: string, params?: unknown): Promise<void> => {
        if (!child.stdin) {
          throw new Error('JSON-RPC stdin is not available');
        }

        await new Promise<void>((resolve, reject) => {
          child.stdin!.write(`${JSON.stringify({ method, params })}\n`, (error) => {
            if (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
              return;
            }
            resolve();
          });
        });
      },
    };

    try {
      return await handler(session);
    } finally {
      rejectAll(new Error('JSON-RPC session closed'));
      lineReader.close();
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
      }
      killProcessTree(child);
      try {
        await once(child, 'close');
      } catch {
        this.logger.warn('json-rpc close wait failed');
      }
    }
  }
}
